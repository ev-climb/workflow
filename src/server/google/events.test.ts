import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EventEtagMismatchError,
  GoogleApiError,
  SyncTokenExpiredError,
  SyncTokenRejectedError,
  fetchEvent,
  fetchEvents,
  mapEvent,
  patchEvent,
} from './events.ts'

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('разбор события', () => {
  it('событие на весь день остаётся датами и не превращается в моменты', () => {
    const event = mapEvent({
      id: 'e1',
      summary: 'Отпуск',
      start: { date: '2026-07-27' },
      end: { date: '2026-07-30' },
    })

    expect(event?.times).toEqual({
      allDay: true,
      startDate: '2026-07-27',
      endDate: '2026-07-30',
      startsAt: null,
      endsAt: null,
    })
  })

  it('однодневное событие на весь день сохраняет исключающую границу Google', () => {
    const event = mapEvent({ id: 'e1', start: { date: '2026-07-27' }, end: { date: '2026-07-28' } })

    expect(event?.times).toMatchObject({ startDate: '2026-07-27', endDate: '2026-07-28' })
  })

  it('нулевая длина выправляется в сутки: такое событие Google принимает и возвращает как есть', () => {
    const event = mapEvent({ id: 'e1', start: { date: '2026-07-27' }, end: { date: '2026-07-27' } })

    expect(event?.times).toMatchObject({ startDate: '2026-07-27', endDate: '2026-07-28' })
  })

  it('дата на границе месяца не уезжает на сутки', () => {
    const event = mapEvent({ id: 'e1', start: { date: '2026-03-01' }, end: { date: '2026-03-01' } })

    expect(event?.times).toMatchObject({ startDate: '2026-03-01', endDate: '2026-03-02' })
  })

  it('событие со временем — моменты, дат нет', () => {
    const event = mapEvent({
      id: 'e2',
      summary: 'Созвон',
      description: '<b>повестка</b>',
      etag: '"3241"',
      updated: '2026-09-01T10:00:00.000Z',
      start: { dateTime: '2026-09-02T12:00:00+03:00' },
      end: { dateTime: '2026-09-02T13:00:00+03:00' },
    })

    expect(event?.times).toEqual({
      allDay: false,
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T10:00:00Z'),
      startDate: null,
      endDate: null,
    })
    expect(event?.descriptionHtml).toBe('<b>повестка</b>')
    expect(event?.googleUpdatedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'))
  })

  it('событие в сутки перевода часов длится час, а не два', () => {
    const event = mapEvent({
      id: 'e3',
      start: { dateTime: '2026-10-25T01:30:00+01:00' },
      end: { dateTime: '2026-10-25T01:30:00Z' },
    })

    expect(event?.times).toMatchObject({
      startsAt: new Date('2026-10-25T00:30:00Z'),
      endsAt: new Date('2026-10-25T01:30:00Z'),
    })
  })

  it('отменённое событие приходит без времени, и это не ошибка разбора', () => {
    const event = mapEvent({ id: 'e4', status: 'cancelled' })

    expect(event).toMatchObject({ googleEventId: 'e4', status: 'cancelled', times: null })
  })

  it('экземпляр повторяющегося события помнит серию', () => {
    const event = mapEvent({
      id: 'series_20260727',
      recurringEventId: 'series',
      start: { dateTime: '2026-07-27T09:00:00Z' },
      end: { dateTime: '2026-07-27T10:00:00Z' },
    })

    expect(event?.recurringEventId).toBe('series')
  })

  it('запись без идентификатора отбрасывается', () => {
    expect(mapEvent({ summary: 'ничьё' })).toBeNull()
  })
})

describe('выборка событий', () => {
  it('полная синхронизация идёт окном ADR-008, без токена', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ items: [], nextSyncToken: 'CAES' }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await fetchEvents('ya29.access', 'me@gmail.com', null, new Date('2026-09-02T00:00:00Z'))

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('timeMin')).toBe('2026-08-03T00:00:00.000Z')
    expect(url.searchParams.get('timeMax')).toBe('2027-09-02T00:00:00.000Z')
    expect(url.searchParams.get('singleEvents')).toBe('true')
    expect(url.searchParams.get('syncToken')).toBeNull()
    expect(page.nextSyncToken).toBe('CAES')
  })

  it('инкрементальная идёт токеном и без границ: с syncToken Google не принимает timeMax', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchEvents('ya29.access', 'me@gmail.com', 'CAES')

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('syncToken')).toBe('CAES')
    expect(url.searchParams.get('timeMin')).toBeNull()
    expect(url.searchParams.get('timeMax')).toBeNull()
  })

  it('страницы обходятся до конца, токен берётся с последней', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer({ items: [{ id: 'e1', status: 'cancelled' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(answer({ items: [{ id: 'e2', status: 'cancelled' }], nextSyncToken: 'CAES' }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await fetchEvents('ya29.access', 'me@gmail.com', null)

    expect(page.events.map((event) => event.googleEventId)).toEqual(['e1', 'e2'])
    expect(page.nextSyncToken).toBe('CAES')
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('pageToken')).toBe('p2')
  })

  it('410 — протухший токен', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ error: { message: 'Sync token is no longer valid' } }, 410)))

    await expect(fetchEvents('ya29.access', 'me@gmail.com', 'CAES')).rejects.toBeInstanceOf(
      SyncTokenExpiredError,
    )
  })

  it('400 про sync-токен отделён от протухшего: это наш мусор, а не штатное протухание', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ error: { message: 'Invalid sync token value.' } }, 400)))

    const failure = await fetchEvents('ya29.access', 'me@gmail.com', 'мусор').catch((error) => error)

    expect(failure).toBeInstanceOf(SyncTokenRejectedError)
    expect(failure).not.toBeInstanceOf(SyncTokenExpiredError)
  })

  it('прочий 400 остаётся обычным отказом', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ error: { message: 'Bad Request' } }, 400)))

    const failure = await fetchEvents('ya29.access', 'me@gmail.com', null).catch((error) => error)

    expect(failure).toBeInstanceOf(GoogleApiError)
    expect(failure).not.toBeInstanceOf(SyncTokenRejectedError)
  })

  it('токен в сообщение об ошибке не попадает', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ error: { message: 'Bad Request' } }, 403)))

    const failure = await fetchEvents('ya29.secret', 'me@gmail.com', 'CAES-secret').catch((e) => e)

    expect(String((failure as Error).message)).not.toContain('secret')
  })
})

describe('запись события обратно', () => {
  it('PATCH идёт с If-Match и несёт только правленые поля', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 'e1', etag: '"42"' }))
    vi.stubGlobal('fetch', fetchMock)

    await patchEvent('ya29.access', 'me@gmail.com', 'e1', { title: 'Созвон' }, '"41"')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/me%40gmail.com/events/e1',
    )
    expect(init.method).toBe('PATCH')
    expect(init.headers['if-match']).toBe('"41"')
    expect(JSON.parse(init.body)).toEqual({ summary: 'Созвон' })
  })

  it('без etag заголовка If-Match нет', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 'e1' }))
    vi.stubGlobal('fetch', fetchMock)

    await patchEvent('ya29.access', 'me@gmail.com', 'e1', { title: 'Созвон' }, null)

    expect(fetchMock.mock.calls[0][1].headers['if-match']).toBeUndefined()
  })

  it('событие на весь день уходит датами, без часового пояса и без сдвига на сутки', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 'e1' }))
    vi.stubGlobal('fetch', fetchMock)

    await patchEvent(
      'ya29.access',
      'me@gmail.com',
      'e1',
      {
        times: {
          allDay: true,
          startDate: '2026-03-01',
          endDate: '2026-03-02',
          startsAt: null,
          endsAt: null,
        },
      },
      '"41"',
    )

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      start: { date: '2026-03-01' },
      end: { date: '2026-03-02' },
    })
  })

  it('событие на переходе на летнее время уходит моментами, длина не меняется', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 'e1' }))
    vi.stubGlobal('fetch', fetchMock)

    await patchEvent(
      'ya29.access',
      'me@gmail.com',
      'e1',
      {
        times: {
          allDay: false,
          startsAt: new Date('2026-03-29T00:30:00Z'),
          endsAt: new Date('2026-03-29T01:30:00Z'),
          startDate: null,
          endDate: null,
        },
      },
      null,
    )

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      start: { dateTime: '2026-03-29T00:30:00.000Z' },
      end: { dateTime: '2026-03-29T01:30:00.000Z' },
    })
  })

  it('412 — устаревший etag, отдельной ошибкой', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(answer({ error: { message: 'Precondition Failed' } }, 412)),
    )

    const failure = await patchEvent('ya29.access', 'me@gmail.com', 'e1', { title: 'Х' }, '"41"').catch(
      (error) => error,
    )

    expect(failure).toBeInstanceOf(EventEtagMismatchError)
  })

  it('токен в сообщение об отказе записи не попадает', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ error: { message: 'Forbidden' } }, 403)))

    const failure = await patchEvent('ya29.secret', 'me@gmail.com', 'e1', { title: 'Х' }, null).catch(
      (error) => error,
    )

    expect(String((failure as Error).message)).not.toContain('secret')
  })

  it('перечитывание стёртого события — не ошибка, а его отсутствие', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ error: { message: 'Not Found' } }, 404)))

    await expect(fetchEvent('ya29.access', 'me@gmail.com', 'e1')).resolves.toBeNull()
  })

  it('перечитанное событие приходит в нашей форме', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        answer({
          id: 'e1',
          summary: 'Созвон',
          etag: '"42"',
          start: { dateTime: '2026-09-02T09:00:00Z' },
          end: { dateTime: '2026-09-02T10:00:00Z' },
        }),
      ),
    )

    const event = await fetchEvent('ya29.access', 'me@gmail.com', 'e1')

    expect(event).toMatchObject({ googleEventId: 'e1', title: 'Созвон', etag: '"42"' })
  })
})
