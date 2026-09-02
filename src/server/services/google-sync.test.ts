import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.ts'
import { calendarEvents, googleAccounts, googleCalendars } from '../db/schema.ts'
import type { GoogleEvent } from '../google/events.ts'
import { SyncTokenExpiredError, SyncTokenRejectedError } from '../google/events.ts'
import { syncAllCalendars, syncCalendar } from './google-sync.ts'

vi.mock('../google/events.ts', async (importActual) => {
  const actual = await importActual<typeof import('../google/events.ts')>()
  return { ...actual, fetchEvents: vi.fn() }
})
vi.mock('./google-accounts.ts', async (importActual) => {
  const actual = await importActual<typeof import('./google-accounts.ts')>()
  return { ...actual, accessTokenFor: vi.fn() }
})

const { fetchEvents } = vi.mocked(await import('../google/events.ts'))
const { accessTokenFor } = vi.mocked(await import('./google-accounts.ts'))

beforeEach(() => {
  vi.clearAllMocks()
  accessTokenFor.mockResolvedValue('ya29.access')
})

async function calendar(patch: { syncToken?: string; syncedAt?: Date; email?: string } = {}) {
  const [account] = await db
    .insert(googleAccounts)
    .values({ email: patch.email ?? 'me@gmail.com', refreshTokenEncrypted: 'шифротекст' })
    .returning({ id: googleAccounts.id })

  const [row] = await db
    .insert(googleCalendars)
    .values({
      accountId: account.id,
      googleCalendarId: 'me@gmail.com',
      title: 'Личный',
      syncToken: patch.syncToken ?? null,
      syncedAt: patch.syncedAt ?? null,
    })
    .returning({ id: googleCalendars.id })

  return { accountId: account.id, calendarId: row.id }
}

function timed(patch: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    googleEventId: 'e1',
    status: 'confirmed',
    title: 'Созвон',
    descriptionHtml: null,
    etag: '"3241"',
    googleUpdatedAt: new Date('2026-09-01T10:00:00Z'),
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

function allDay(patch: Partial<GoogleEvent> = {}): GoogleEvent {
  return timed({
    googleEventId: 'e-all-day',
    title: 'Отпуск',
    times: {
      allDay: true,
      startDate: '2026-03-01',
      endDate: '2026-03-02',
      startsAt: null,
      endsAt: null,
    },
    ...patch,
  })
}

function page(events: GoogleEvent[], nextSyncToken: string | null = 'CAES') {
  return { events, nextSyncToken }
}

function eventsOf(calendarId: string) {
  return db.select().from(calendarEvents).where(eq(calendarEvents.calendarId, calendarId))
}

describe('синхронизация календаря', () => {
  it('без токена идёт полной и запоминает выданный токен', async () => {
    const { calendarId } = await calendar()
    fetchEvents.mockResolvedValue(page([timed()]))

    const result = await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    expect(result).toMatchObject({ mode: 'full', saved: 1, cancelled: 0, skipped: 0 })
    expect(fetchEvents.mock.calls[0][2]).toBeNull()

    const [saved] = await db
      .select({ syncToken: googleCalendars.syncToken, syncedAt: googleCalendars.syncedAt })
      .from(googleCalendars)
      .where(eq(googleCalendars.id, calendarId))
    expect(saved.syncToken).toBe('CAES')
    expect(saved.syncedAt).toEqual(new Date('2026-09-02T12:00:00Z'))
  })

  it('с токеном идёт инкрементальной', async () => {
    const { calendarId } = await calendar({ syncToken: 'CAES', syncedAt: new Date('2026-09-02T11:00:00Z') })
    fetchEvents.mockResolvedValue(page([], 'CAES2'))

    const result = await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    expect(result.mode).toBe('incremental')
    expect(fetchEvents.mock.calls[0][2]).toBe('CAES')
  })

  it('токен старше месяца не используется: окно ADR-008 само вперёд не едет', async () => {
    const { calendarId } = await calendar({ syncToken: 'CAES', syncedAt: new Date('2026-07-01T12:00:00Z') })
    fetchEvents.mockResolvedValue(page([]))

    const result = await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    expect(result.mode).toBe('full')
    expect(fetchEvents.mock.calls[0][2]).toBeNull()
  })

  it('повторный проход правит событие, а не заводит второе', async () => {
    const { calendarId } = await calendar()
    fetchEvents.mockResolvedValue(page([timed()]))
    await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    fetchEvents.mockResolvedValue(page([timed({ title: 'Созвон перенесён', etag: '"3242"' })]))
    await syncCalendar(calendarId, new Date('2026-09-02T12:01:00Z'))

    const rows = await eventsOf(calendarId)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Созвон перенесён')
    expect(rows[0].etag).toBe('"3242"')
  })

  it('событие на весь день ложится датами и не уезжает на сутки', async () => {
    const { calendarId } = await calendar()
    fetchEvents.mockResolvedValue(page([allDay()]))

    await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    const [row] = await eventsOf(calendarId)
    expect(row).toMatchObject({
      allDay: true,
      startDate: '2026-03-01',
      endDate: '2026-03-02',
      startsAt: null,
      endsAt: null,
    })
  })

  it('отменённое событие помечается удалённым, а не пропадает из базы', async () => {
    const { calendarId } = await calendar()
    fetchEvents.mockResolvedValue(page([timed()]))
    await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    fetchEvents.mockResolvedValue(page([timed({ status: 'cancelled', times: null })]))
    const result = await syncCalendar(calendarId, new Date('2026-09-02T12:01:00Z'))

    expect(result).toMatchObject({ cancelled: 1, saved: 0 })
    const [row] = await eventsOf(calendarId)
    expect(row.status).toBe('cancelled')
    expect(row.deletedAt).not.toBeNull()
    expect(row.startsAt).not.toBeNull()
  })

  it('отмена события, которого у нас нет, не ошибка', async () => {
    const { calendarId } = await calendar()
    fetchEvents.mockResolvedValue(page([timed({ googleEventId: 'чужое', status: 'cancelled', times: null })]))

    const result = await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    expect(result).toMatchObject({ saved: 0, cancelled: 0, skipped: 1 })
    expect(await eventsOf(calendarId)).toHaveLength(0)
  })

  it('восстановленное в Google событие снимает пометку удаления', async () => {
    const { calendarId } = await calendar()
    fetchEvents.mockResolvedValue(page([timed()]))
    await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))
    fetchEvents.mockResolvedValue(page([timed({ status: 'cancelled', times: null })]))
    await syncCalendar(calendarId, new Date('2026-09-02T12:01:00Z'))

    fetchEvents.mockResolvedValue(page([timed()]))
    await syncCalendar(calendarId, new Date('2026-09-02T12:02:00Z'))

    const [row] = await eventsOf(calendarId)
    expect(row.deletedAt).toBeNull()
    expect(row.status).toBe('confirmed')
  })

  it('событие за горизонтом принимается как есть: дельта окно не соблюдает', async () => {
    const { calendarId } = await calendar({ syncToken: 'CAES', syncedAt: new Date('2026-09-02T11:00:00Z') })
    const faraway = timed({
      googleEventId: 'далёкое',
      times: {
        allDay: false,
        startsAt: new Date('2029-01-01T09:00:00Z'),
        endsAt: new Date('2029-01-01T10:00:00Z'),
        startDate: null,
        endDate: null,
      },
    })
    fetchEvents.mockResolvedValue(page([faraway]))

    const result = await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    expect(result.saved).toBe(1)
  })

  it('протухший токен обнуляется, и проход повторяется полным', async () => {
    const { calendarId } = await calendar({ syncToken: 'CAES', syncedAt: new Date('2026-09-02T11:00:00Z') })
    fetchEvents
      .mockRejectedValueOnce(new SyncTokenExpiredError('токен протух', 410))
      .mockResolvedValueOnce(page([timed()], 'CAES2'))

    const result = await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    expect(result.mode).toBe('full')
    expect(fetchEvents.mock.calls[1][2]).toBeNull()
    const [saved] = await db
      .select({ syncToken: googleCalendars.syncToken })
      .from(googleCalendars)
      .where(eq(googleCalendars.id, calendarId))
    expect(saved.syncToken).toBe('CAES2')
  })

  it('непризнанный токен восстанавливается так же, но говорит об этом отдельно', async () => {
    const { calendarId } = await calendar({ syncToken: 'мусор', syncedAt: new Date('2026-09-02T11:00:00Z') })
    fetchEvents
      .mockRejectedValueOnce(new SyncTokenRejectedError('Invalid sync token value.', 400))
      .mockResolvedValueOnce(page([]))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))

    expect(result.mode).toBe('full')
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('прочий отказ не превращается в полную синхронизацию', async () => {
    const { calendarId } = await calendar({ syncToken: 'CAES', syncedAt: new Date('2026-09-02T11:00:00Z') })
    fetchEvents.mockRejectedValue(new Error('сеть отвалилась'))

    await expect(syncCalendar(calendarId, new Date('2026-09-02T12:00:00Z'))).rejects.toThrow(
      'сеть отвалилась',
    )
    expect(fetchEvents).toHaveBeenCalledTimes(1)
  })
})

describe('проход по всем календарям', () => {
  it('отвалившийся аккаунт пропускается, остальные синхронизируются', async () => {
    const alive = await calendar({ email: 'alive@gmail.com' })
    const dead = await calendar({ email: 'dead@gmail.com' })
    await db
      .update(googleAccounts)
      .set({ needsReauth: true })
      .where(eq(googleAccounts.id, dead.accountId))
    fetchEvents.mockResolvedValue(page([timed()]))

    const run = await syncAllCalendars(new Date('2026-09-02T12:00:00Z'))

    expect(run.results.map((result) => result.calendarId)).toEqual([alive.calendarId])
    expect(run.failures).toHaveLength(0)
  })

  it('упавший календарь не отменяет остальные', async () => {
    const first = await calendar({ email: 'first@gmail.com' })
    const second = await calendar({ email: 'second@gmail.com' })
    fetchEvents
      .mockRejectedValueOnce(new Error('сеть отвалилась'))
      .mockResolvedValueOnce(page([timed()]))

    const run = await syncAllCalendars(new Date('2026-09-02T12:00:00Z'))

    expect(run.failures.map((failure) => failure.calendarId)).toEqual([first.calendarId])
    expect(run.results.map((result) => result.calendarId)).toEqual([second.calendarId])
  })

  it('спрятанный календарь синхронизируется тоже: видимость — дело отрисовки', async () => {
    const { calendarId } = await calendar()
    await db.update(googleCalendars).set({ visible: false }).where(eq(googleCalendars.id, calendarId))
    fetchEvents.mockResolvedValue(page([timed()]))

    const run = await syncAllCalendars(new Date('2026-09-02T12:00:00Z'))

    expect(run.results).toHaveLength(1)
    const [row] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.calendarId, calendarId), eq(calendarEvents.googleEventId, 'e1')))
    expect(row).toBeDefined()
  })
})
