import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { calendarEvents, googleAccounts, googleCalendars } from '../db/schema.ts'
import {
  type EventTimes,
  type GoogleEvent,
  SyncTokenExpiredError,
  SyncTokenRejectedError,
  fetchEvents,
} from '../google/events.ts'
import { publishCalendarChanged } from './board-events.ts'
import { NotFoundError, ReauthRequiredError } from './errors.ts'
import { accessTokenFor } from './google-accounts.ts'

/**
 * ADR-008, правило 5: окно полной синхронизации прибито к моменту запроса и само вперёд
 * не едет. Раз в месяц синхронизация идёт полной заново, иначе горизонт не катится.
 */
const FULL_RESYNC_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

const INSERT_CHUNK = 500

export type CalendarSyncResult = {
  calendarId: string
  mode: 'full' | 'incremental'
  /** Заведено или обновлено событий. */
  saved: number
  /** Помечено удалёнными: пришли со статусом `cancelled`. */
  cancelled: number
  /** Пропущено: отмена события, которого у нас нет, и записи без пары времени. */
  skipped: number
}

const CALENDAR = {
  id: googleCalendars.id,
  accountId: googleCalendars.accountId,
  googleCalendarId: googleCalendars.googleCalendarId,
  syncToken: googleCalendars.syncToken,
  syncedAt: googleCalendars.syncedAt,
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let at = 0; at < items.length; at += size) result.push(items.slice(at, at + size))
  return result
}

/**
 * Отмена приходит одним идентификатором со статусом, без времени. Событие, которого у нас
 * нет, отменять нечем — вставить его мы не можем, инвариант 3 требует пару времени.
 */
async function markCancelled(calendarId: string, events: GoogleEvent[]): Promise<number> {
  let cancelled = 0
  const now = new Date()

  for (const batch of chunks(events, INSERT_CHUNK)) {
    const updated = await db
      .update(calendarEvents)
      .set({ status: 'cancelled', deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(calendarEvents.calendarId, calendarId),
          inArray(
            calendarEvents.googleEventId,
            batch.map((event) => event.googleEventId),
          ),
        ),
      )
      .returning({ id: calendarEvents.id })
    cancelled += updated.length
  }

  return cancelled
}

type TimedEvent = GoogleEvent & { times: EventTimes }

async function saveEvents(calendarId: string, events: TimedEvent[]): Promise<void> {
  const now = new Date()

  for (const batch of chunks(events, INSERT_CHUNK)) {
    await db
      .insert(calendarEvents)
      .values(
        batch.map((event) => ({
          calendarId,
          googleEventId: event.googleEventId,
          title: event.title,
          descriptionHtml: event.descriptionHtml,
          etag: event.etag,
          googleUpdatedAt: event.googleUpdatedAt,
          status: event.status,
          recurringEventId: event.recurringEventId,
          deletedAt: null,
          ...event.times,
        })),
      )
      .onConflictDoUpdate({
        target: [calendarEvents.calendarId, calendarEvents.googleEventId],
        set: {
          title: sql`excluded.title`,
          descriptionHtml: sql`excluded.description_html`,
          etag: sql`excluded.etag`,
          googleUpdatedAt: sql`excluded.google_updated_at`,
          status: sql`excluded.status`,
          recurringEventId: sql`excluded.recurring_event_id`,
          allDay: sql`excluded.all_day`,
          startsAt: sql`excluded.starts_at`,
          endsAt: sql`excluded.ends_at`,
          startDate: sql`excluded.start_date`,
          endDate: sql`excluded.end_date`,
          // событие вернулось из отмены: в Google отменённое можно восстановить
          deletedAt: null,
          updatedAt: now,
        },
      })
  }
}

/** Пачка событий Google в базу: живые заводятся и обновляются, отменённые помечаются. */
export async function applyEvents(
  calendarId: string,
  events: GoogleEvent[],
): Promise<{ saved: number; cancelled: number; skipped: number }> {
  const live: TimedEvent[] = []
  const gone: GoogleEvent[] = []
  let skipped = 0

  for (const event of events) {
    if (event.status === 'cancelled') gone.push(event)
    else if (event.times) live.push({ ...event, times: event.times })
    else skipped += 1
  }

  await saveEvents(calendarId, live)
  const cancelled = await markCancelled(calendarId, gone)

  // единственное место, где события меняются: и синхронизация, и запись правки идут сюда
  if (live.length > 0 || cancelled > 0) publishCalendarChanged()

  return { saved: live.length, cancelled, skipped: skipped + (gone.length - cancelled) }
}

/**
 * Один календарь. Без `sync_token` — полная выборка в окне ADR-008, с токеном —
 * инкрементальная. Протухший токен обнуляется, и проход повторяется полным ровно один раз:
 * второй отказ уже не про токен.
 */
export async function syncCalendar(id: string, now: Date = new Date()): Promise<CalendarSyncResult> {
  const [calendar] = await db.select(CALENDAR).from(googleCalendars).where(eq(googleCalendars.id, id))
  if (!calendar) throw new NotFoundError(`календаря ${id} нет`)

  const stale =
    !calendar.syncedAt || now.getTime() - calendar.syncedAt.getTime() > FULL_RESYNC_INTERVAL_MS
  let syncToken = stale ? null : calendar.syncToken
  const accessToken = await accessTokenFor(calendar.accountId)

  let page
  try {
    page = await fetchEvents(accessToken, calendar.googleCalendarId, syncToken, now)
  } catch (error) {
    if (!(error instanceof SyncTokenExpiredError || error instanceof SyncTokenRejectedError)) {
      throw error
    }
    // 400 — не штатный переход, а признак того, что мы записали мусор: восстановление то же,
    // но без отдельной записи баг записи спрячется за нормальным протуханием токена
    if (error instanceof SyncTokenRejectedError) {
      console.warn(
        `синхронизация ${calendar.googleCalendarId}: Google не признал sync-токен своим,` +
          ' полная синхронизация заново — проверь, что записывается в sync_token',
      )
    }
    await db
      .update(googleCalendars)
      .set({ syncToken: null, updatedAt: new Date() })
      .where(eq(googleCalendars.id, id))

    syncToken = null
    page = await fetchEvents(accessToken, calendar.googleCalendarId, null, now)
  }

  const counts = await applyEvents(id, page.events)

  await db
    .update(googleCalendars)
    .set({ syncToken: page.nextSyncToken, syncedAt: now, updatedAt: new Date() })
    .where(eq(googleCalendars.id, id))

  return { calendarId: id, mode: syncToken ? 'incremental' : 'full', ...counts }
}

export type SyncRun = {
  results: CalendarSyncResult[]
  /** Календари, на которых проход упал: остальные при этом синхронизированы. */
  failures: { calendarId: string; error: unknown }[]
}

/**
 * Все календари подключённых аккаунтов. Отвалившийся аккаунт пропускается молча — полосу
 * о нём показывает интерфейс, а не синхронизация; на остальных проход идёт как обычно.
 *
 * Спрятанные календари синхронизируются тоже: видимость — свойство отрисовки, и календарь,
 * возвращённый галкой, должен показать события сразу, а не после следующего прохода.
 */
export async function syncAllCalendars(now: Date = new Date()): Promise<SyncRun> {
  const calendars = await db
    .select({ id: googleCalendars.id })
    .from(googleCalendars)
    .innerJoin(googleAccounts, eq(googleAccounts.id, googleCalendars.accountId))
    .where(eq(googleAccounts.needsReauth, false))
    .orderBy(asc(googleCalendars.createdAt))

  const results: CalendarSyncResult[] = []
  const failures: { calendarId: string; error: unknown }[] = []

  for (const calendar of calendars) {
    try {
      results.push(await syncCalendar(calendar.id, now))
    } catch (error) {
      if (error instanceof ReauthRequiredError) continue
      failures.push({ calendarId: calendar.id, error })
    }
  }

  return { results, failures }
}
