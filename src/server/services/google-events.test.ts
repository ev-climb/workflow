import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.ts'
import { calendarEvents, googleAccounts, googleCalendars } from '../db/schema.ts'
import { EventEtagMismatchError, type GoogleEvent } from '../google/events.ts'
import { DEFAULT_CALENDAR_COLOR } from '../../lib/calendar-colors.ts'
import { ConflictError, InvalidInputError, NotFoundError } from './errors.ts'
import { createEvent, getEvent, listEvents, removeEvent, updateEvent } from './google-events.ts'

vi.mock('../google/events.ts', async (importActual) => {
  const actual = await importActual<typeof import('../google/events.ts')>()
  return {
    ...actual,
    patchEvent: vi.fn(),
    fetchEvent: vi.fn(),
    insertEvent: vi.fn(),
    deleteEvent: vi.fn(),
  }
})
vi.mock('./google-accounts.ts', async (importActual) => {
  const actual = await importActual<typeof import('./google-accounts.ts')>()
  return { ...actual, accessTokenFor: vi.fn() }
})

const { patchEvent, fetchEvent, insertEvent, deleteEvent } = vi.mocked(
  await import('../google/events.ts'),
)
const { accessTokenFor } = vi.mocked(await import('./google-accounts.ts'))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  accessTokenFor.mockResolvedValue('ya29.access')
})

function googleEvent(patch: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    googleEventId: 'e1',
    status: 'confirmed',
    title: 'Созвон',
    descriptionHtml: null,
    etag: '"42"',
    googleUpdatedAt: new Date('2026-09-02T10:00:00Z'),
    recurringEventId: null,
    htmlLink: null,
    times: {
      allDay: false,
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T10:00:00Z'),
      startDate: null,
      endDate: null,
    },
    ...patch,
  }
}

async function event(
  patch: {
    etag?: string | null
    deletedAt?: Date
    descriptionHtml?: string
    googleEventId?: string
    recurringEventId?: string
    htmlLink?: string
  } = {},
) {
  const [account] = await db
    .insert(googleAccounts)
    .values({ email: 'me@gmail.com', refreshTokenEncrypted: 'шифротекст' })
    .returning({ id: googleAccounts.id })

  const [calendar] = await db
    .insert(googleCalendars)
    .values({ accountId: account.id, googleCalendarId: 'me@gmail.com', title: 'Личный' })
    .returning({ id: googleCalendars.id })

  const [row] = await db
    .insert(calendarEvents)
    .values({
      calendarId: calendar.id,
      googleEventId: patch.googleEventId ?? 'e1',
      title: 'Созвон',
      etag: patch.etag === undefined ? '"41"' : patch.etag,
      descriptionHtml: patch.descriptionHtml ?? null,
      recurringEventId: patch.recurringEventId ?? null,
      htmlLink: patch.htmlLink ?? null,
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T10:00:00Z'),
      deletedAt: patch.deletedAt ?? null,
    })
    .returning({ id: calendarEvents.id })

  return { eventId: row.id, calendarId: calendar.id }
}

function stored(id: string) {
  return db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .then(([row]) => row)
}

describe('правка события в Google', () => {
  it('записывает правку с текущим etag и кладёт ответ Google в базу', async () => {
    const { eventId } = await event()
    patchEvent.mockResolvedValue(googleEvent({ title: 'Созвон с Петей', etag: '"43"' }))

    const result = await updateEvent(eventId, { title: 'Созвон с Петей' })

    expect(result).toEqual({ eventId, conflict: false, goneInGoogle: false })
    expect(patchEvent).toHaveBeenCalledWith(
      'ya29.access',
      'me@gmail.com',
      'e1',
      { title: 'Созвон с Петей' },
      '"41"',
    )
    const row = await stored(eventId)
    expect(row).toMatchObject({ title: 'Созвон с Петей', etag: '"43"' })
  })

  it('правка повторяющегося идёт по экземпляру, а не по серии: ADR-004', async () => {
    const { eventId } = await event({
      googleEventId: 'series_20260902T090000Z',
      recurringEventId: 'series',
    })
    patchEvent.mockResolvedValue(
      googleEvent({ googleEventId: 'series_20260902T090000Z', recurringEventId: 'series' }),
    )

    await updateEvent(eventId, { title: 'Только сегодня' })

    expect(patchEvent).toHaveBeenCalledWith(
      'ya29.access',
      'me@gmail.com',
      'series_20260902T090000Z',
      { title: 'Только сегодня' },
      '"41"',
    )
  })

  it('412: чужая правка ложится в базу, наша накладывается поверх новым etag', async () => {
    const { eventId } = await event()
    patchEvent
      .mockRejectedValueOnce(new EventEtagMismatchError('устарел', 412))
      // Google в ответе на PATCH отдаёт событие целиком, вместе с чужим описанием
      .mockResolvedValueOnce(
        googleEvent({ title: 'Наш заголовок', descriptionHtml: '<p>чужое</p>', etag: '"44"' }),
      )
    fetchEvent.mockResolvedValue(
      googleEvent({ title: 'Чужой заголовок', descriptionHtml: '<p>чужое</p>', etag: '"43"' }),
    )

    const result = await updateEvent(eventId, { title: 'Наш заголовок' })

    expect(result).toEqual({ eventId, conflict: true, goneInGoogle: false })
    expect(patchEvent.mock.calls[1][4]).toBe('"43"')
    const row = await stored(eventId)
    // описание тронули не мы, и оно осталось чужим: PATCH несёт только правленые поля
    expect(row).toMatchObject({ title: 'Наш заголовок', descriptionHtml: '<p>чужое</p>' })
  })

  it('412 пишет конфликт в лог', async () => {
    const { eventId } = await event()
    patchEvent
      .mockRejectedValueOnce(new EventEtagMismatchError('устарел', 412))
      .mockResolvedValueOnce(googleEvent())
    fetchEvent.mockResolvedValue(googleEvent({ etag: '"43"' }))

    await updateEvent(eventId, { title: 'Наш заголовок' })

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('конфликт записи события e1'))
  })

  it('событие, отменённое в Google, правкой не воскрешает', async () => {
    const { eventId } = await event()
    patchEvent.mockRejectedValueOnce(new EventEtagMismatchError('устарел', 412))
    fetchEvent.mockResolvedValue(googleEvent({ status: 'cancelled', times: null }))

    const result = await updateEvent(eventId, { title: 'Наш заголовок' })

    expect(result).toEqual({ eventId, conflict: true, goneInGoogle: true })
    expect(patchEvent).toHaveBeenCalledTimes(1)
    const row = await stored(eventId)
    expect(row.status).toBe('cancelled')
    expect(row.deletedAt).not.toBeNull()
    expect(row.title).toBe('Созвон')
  })

  it('событие, стёртое в Google насовсем, помечается тем же путём', async () => {
    const { eventId } = await event()
    patchEvent.mockRejectedValueOnce(new EventEtagMismatchError('устарел', 412))
    fetchEvent.mockResolvedValue(null)

    const result = await updateEvent(eventId, { title: 'Наш заголовок' })

    expect(result.goneInGoogle).toBe(true)
    const row = await stored(eventId)
    expect(row.deletedAt).not.toBeNull()
  })

  it('второй подряд 412 — отказ, а не бесконечный круг', async () => {
    const { eventId } = await event()
    patchEvent.mockRejectedValue(new EventEtagMismatchError('устарел', 412))
    fetchEvent.mockResolvedValue(googleEvent({ etag: '"43"' }))

    await expect(updateEvent(eventId, { title: 'Наш заголовок' })).rejects.toBeInstanceOf(ConflictError)
    expect(patchEvent).toHaveBeenCalledTimes(2)
  })

  it('событие на весь день уходит датами как есть', async () => {
    const { eventId } = await event()
    patchEvent.mockResolvedValue(
      googleEvent({
        times: {
          allDay: true,
          startDate: '2026-03-01',
          endDate: '2026-03-02',
          startsAt: null,
          endsAt: null,
        },
      }),
    )

    await updateEvent(eventId, {
      times: {
        allDay: true,
        startDate: '2026-03-01',
        endDate: '2026-03-02',
        startsAt: null,
        endsAt: null,
      },
    })

    expect(patchEvent.mock.calls[0][3].times).toMatchObject({
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    })
    const row = await stored(eventId)
    expect(row).toMatchObject({ allDay: true, startDate: '2026-03-01', endDate: '2026-03-02' })
  })

  it('событие на весь день короче суток не принимается: граница у Google исключающая', async () => {
    const { eventId } = await event()

    await expect(
      updateEvent(eventId, {
        times: {
          allDay: true,
          startDate: '2026-03-01',
          endDate: '2026-03-01',
          startsAt: null,
          endsAt: null,
        },
      }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    expect(patchEvent).not.toHaveBeenCalled()
  })

  it('конец раньше начала не принимается', async () => {
    const { eventId } = await event()

    await expect(
      updateEvent(eventId, {
        times: {
          allDay: false,
          startsAt: new Date('2026-09-02T10:00:00Z'),
          endsAt: new Date('2026-09-02T09:00:00Z'),
          startDate: null,
          endDate: null,
        },
      }),
    ).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('пустая правка — ошибка входа, а не поход в Google', async () => {
    const { eventId } = await event()

    await expect(updateEvent(eventId, {})).rejects.toBeInstanceOf(InvalidInputError)
    expect(accessTokenFor).not.toHaveBeenCalled()
  })

  it('удалённое и несуществующее событие не правятся', async () => {
    const { eventId } = await event({ deletedAt: new Date() })

    await expect(updateEvent(eventId, { title: 'Х' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      updateEvent('00000000-0000-0000-0000-000000000000', { title: 'Х' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('событие без etag пишется без If-Match', async () => {
    const { eventId } = await event({ etag: null })
    patchEvent.mockResolvedValue(googleEvent())

    await updateEvent(eventId, { title: 'Созвон' })

    expect(patchEvent.mock.calls[0][4]).toBeNull()
  })
})

async function calendar(patch: { color?: string; visible?: boolean } = {}) {
  const [account] = await db
    .insert(googleAccounts)
    .values({ email: `me${counter++}@gmail.com`, refreshTokenEncrypted: 'шифротекст' })
    .returning({ id: googleAccounts.id })

  const [row] = await db
    .insert(googleCalendars)
    .values({
      accountId: account.id,
      googleCalendarId: 'me@gmail.com',
      title: 'Личный',
      color: patch.color ?? null,
      visible: patch.visible ?? true,
    })
    .returning({ id: googleCalendars.id })

  return row.id
}

let counter = 0

function put(calendarId: string, values: Partial<typeof calendarEvents.$inferInsert>) {
  return db
    .insert(calendarEvents)
    .values({ calendarId, googleEventId: `e${counter++}`, title: 'Событие', ...values })
    .returning({ id: calendarEvents.id })
    .then(([row]) => row.id)
}

describe('описание события', () => {
  it('уходит в Google разметкой: перевод строки не теряется', async () => {
    const { eventId } = await event()
    patchEvent.mockResolvedValue(googleEvent({ descriptionHtml: 'Повестка:<br>сроки' }))

    await updateEvent(eventId, { description: 'Повестка:\nсроки' })

    expect(patchEvent.mock.calls[0][3]).toEqual({ descriptionHtml: 'Повестка:<br>сроки' })
  })

  it('пустое описание стирает, а не пишет пустую строку', async () => {
    const { eventId } = await event({ descriptionHtml: '<p>было</p>' })
    patchEvent.mockResolvedValue(googleEvent({ descriptionHtml: null }))

    await updateEvent(eventId, { description: '   ' })

    expect(patchEvent.mock.calls[0][3]).toEqual({ descriptionHtml: null })
  })
})

describe('событие для панели правки', () => {
  it('отдаёт описание текстом и календарь, в котором событие лежит', async () => {
    const { eventId, calendarId } = await event({
      descriptionHtml: '<p>Повестка</p><a href="https://meet.google.com/x">Meet</a>',
    })

    const found = await getEvent(eventId)

    expect(found).toMatchObject({
      id: eventId,
      calendarId,
      title: 'Созвон',
      description: 'Повестка\nMeet',
      calendarTitle: 'Личный',
      color: DEFAULT_CALENDAR_COLOR,
    })
  })

  it('описания нет — и в поле правки пусто, а не пустая строка', async () => {
    const { eventId } = await event()
    await expect(getEvent(eventId)).resolves.toMatchObject({ description: null })
  })

  it('у экземпляра повторяющегося события есть серия и ссылка на неё в Google', async () => {
    const { eventId } = await event({
      googleEventId: 'series_20260902T090000Z',
      recurringEventId: 'series',
      htmlLink: 'https://www.google.com/calendar/event?eid=c2VyaWVz',
    })

    await expect(getEvent(eventId)).resolves.toMatchObject({
      recurringEventId: 'series',
      htmlLink: 'https://www.google.com/calendar/event?eid=c2VyaWVz',
    })
  })

  it('мягко удалённое и несуществующее не отдаёт', async () => {
    const { eventId } = await event({ deletedAt: new Date() })
    await expect(getEvent(eventId)).rejects.toThrow(NotFoundError)
    await expect(getEvent('00000000-0000-4000-8000-000000000000')).rejects.toThrow(NotFoundError)
  })
})

describe('удаление события', () => {
  it('стирает в Google и гасит у себя, чтобы синхронизация не вернула его назад', async () => {
    const { eventId } = await event()

    const result = await removeEvent(eventId)

    expect(result).toEqual({ eventId })
    expect(deleteEvent).toHaveBeenCalledWith('ya29.access', 'me@gmail.com', 'e1')
    const row = await stored(eventId)
    expect(row.status).toBe('cancelled')
    expect(row.deletedAt).not.toBeNull()
  })

  it('уже удалённое и несуществующее в Google не ходит', async () => {
    const { eventId } = await event({ deletedAt: new Date() })

    await expect(removeEvent(eventId)).rejects.toThrow(NotFoundError)
    await expect(removeEvent('00000000-0000-4000-8000-000000000000')).rejects.toThrow(NotFoundError)
    expect(deleteEvent).not.toHaveBeenCalled()
  })

  it('отказ Google оставляет событие на месте: гасим только то, что стёрли', async () => {
    const { eventId } = await event()
    deleteEvent.mockRejectedValue(new Error('Google отказал'))

    await expect(removeEvent(eventId)).rejects.toThrow('Google отказал')
    const row = await stored(eventId)
    expect(row.status).toBe('confirmed')
    expect(row.deletedAt).toBeNull()
  })
})

describe('создание события в Google', () => {
  const times = {
    allDay: false as const,
    startsAt: new Date('2026-09-02T09:00:00Z'),
    endsAt: new Date('2026-09-02T10:00:00Z'),
    startDate: null,
    endDate: null,
  }

  it('заводит событие в Google и кладёт ответ в базу', async () => {
    const calendarId = await calendar()
    insertEvent.mockResolvedValue(googleEvent({ googleEventId: 'new1', title: 'Созвон' }))

    const { eventId } = await createEvent(calendarId, { title: 'Созвон', times })

    expect(insertEvent).toHaveBeenCalledWith('ya29.access', 'me@gmail.com', {
      title: 'Созвон',
      times,
    })
    const row = await stored(eventId)
    expect(row).toMatchObject({ calendarId, googleEventId: 'new1', title: 'Созвон' })
  })

  it('пустое название уходит как отсутствующее, а не как пробелы', async () => {
    const calendarId = await calendar()
    insertEvent.mockResolvedValue(googleEvent({ googleEventId: 'new2', title: null }))

    await createEvent(calendarId, { title: '   ', times })

    expect(insertEvent.mock.calls[0][2].title).toBeNull()
  })

  it('событие на весь день уходит датами как есть', async () => {
    const calendarId = await calendar()
    const allDay = {
      allDay: true as const,
      startDate: '2026-03-01',
      endDate: '2026-03-02',
      startsAt: null,
      endsAt: null,
    }
    insertEvent.mockResolvedValue(googleEvent({ googleEventId: 'new3', times: allDay }))

    const { eventId } = await createEvent(calendarId, { title: 'Отгул', times: allDay })

    expect(insertEvent.mock.calls[0][2].times).toMatchObject({
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    })
    expect(await stored(eventId)).toMatchObject({
      allDay: true,
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    })
  })

  it('негодное время в Google не уходит', async () => {
    const calendarId = await calendar()

    await expect(
      createEvent(calendarId, { title: 'Созвон', times: { ...times, endsAt: times.startsAt } }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    expect(insertEvent).not.toHaveBeenCalled()
  })

  it('в несуществующий календарь не пишет', async () => {
    await expect(
      createEvent('00000000-0000-4000-8000-000000000000', { title: 'Созвон', times }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(insertEvent).not.toHaveBeenCalled()
  })
})

describe('события в окне сетки', () => {
  it('отдаёт событие со временем вместе с цветом календаря', async () => {
    const calendarId = await calendar({ color: '#039be5' })
    const id = await put(calendarId, {
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T10:00:00Z'),
    })

    expect(await listEvents('2026-09-02', '2026-09-02')).toEqual([
      {
        id,
        calendarId,
        color: '#039be5',
        title: 'Событие',
        allDay: false,
        startsAt: new Date('2026-09-02T09:00:00Z'),
        endsAt: new Date('2026-09-02T10:00:00Z'),
        startDate: null,
        endDate: null,
        recurringEventId: null,
      },
    ])
  })

  it('подставляет запасной цвет календарю без цвета', async () => {
    const calendarId = await calendar()
    await put(calendarId, {
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T10:00:00Z'),
    })

    const [event] = await listEvents('2026-09-02', '2026-09-02')
    expect(event.color).toBe(DEFAULT_CALENDAR_COLOR)
  })

  it('не отдаёт события спрятанного календаря', async () => {
    const calendarId = await calendar({ visible: false })
    await put(calendarId, {
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T10:00:00Z'),
    })

    expect(await listEvents('2026-09-02', '2026-09-02')).toEqual([])
  })

  it('не отдаёт отменённое и мягко удалённое', async () => {
    const calendarId = await calendar()
    await put(calendarId, {
      status: 'cancelled',
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T10:00:00Z'),
    })
    await put(calendarId, {
      deletedAt: new Date(),
      startsAt: new Date('2026-09-02T11:00:00Z'),
      endsAt: new Date('2026-09-02T12:00:00Z'),
    })

    expect(await listEvents('2026-09-02', '2026-09-02')).toEqual([])
  })

  it('режет окно по московским суткам, а не по UTC', async () => {
    const calendarId = await calendar()
    // 21:30 UTC — это уже полпервого ночи третьего числа по-московски
    await put(calendarId, {
      startsAt: new Date('2026-09-02T21:30:00Z'),
      endsAt: new Date('2026-09-02T22:30:00Z'),
    })

    expect(await listEvents('2026-09-02', '2026-09-02')).toEqual([])
    expect(await listEvents('2026-09-03', '2026-09-03')).toHaveLength(1)
  })

  it('берёт событие, заезжающее в окно краем', async () => {
    const calendarId = await calendar()
    await put(calendarId, {
      startsAt: new Date('2026-09-01T20:00:00Z'),
      endsAt: new Date('2026-09-02T04:00:00Z'),
    })

    expect(await listEvents('2026-09-02', '2026-09-02')).toHaveLength(1)
  })

  it('ищет событие на весь день по датам и не двигает его на сутки', async () => {
    const calendarId = await calendar()
    // граница у Google исключающая: это ровно первое марта, и только оно
    const id = await put(calendarId, {
      allDay: true,
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    })

    expect(await listEvents('2026-03-01', '2026-03-01')).toMatchObject([
      { id, allDay: true, startDate: '2026-03-01', endDate: '2026-03-02' },
    ])
    expect(await listEvents('2026-02-28', '2026-02-28')).toEqual([])
    expect(await listEvents('2026-03-02', '2026-03-02')).toEqual([])
  })

  it('внутри дня ставит событие на весь день впереди событий со временем', async () => {
    const calendarId = await calendar()
    await put(calendarId, {
      startsAt: new Date('2026-09-02T06:00:00Z'),
      endsAt: new Date('2026-09-02T07:00:00Z'),
    })
    await put(calendarId, { allDay: true, startDate: '2026-09-02', endDate: '2026-09-03' })

    expect((await listEvents('2026-09-02', '2026-09-02')).map((one) => one.allDay)).toEqual([
      true,
      false,
    ])
  })

  it('не принимает кривое окно', async () => {
    await expect(listEvents('вчера', '2026-09-02')).rejects.toThrow(InvalidInputError)
    await expect(listEvents('2026-09-03', '2026-09-02')).rejects.toThrow(InvalidInputError)
  })
})
