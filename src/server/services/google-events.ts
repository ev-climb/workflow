import { and, eq, gt, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm'
import { DEFAULT_CALENDAR_COLOR } from '../../lib/calendar-colors.ts'
import { addDays } from '../../lib/calendar-grid.ts'
import { momentInMoscow } from '../../lib/dates.ts'
import { descriptionHtml, descriptionText } from '../../lib/event-description.ts'
import { db } from '../db/client.ts'
import { calendarEvents, googleCalendars, timeBlocks } from '../db/schema.ts'
import {
  EventEtagMismatchError,
  type EventDraft,
  type EventPatch,
  type EventTimes,
  type GoogleEvent,
  deleteEvent,
  fetchEvent,
  insertEvent,
  patchEvent,
} from '../google/events.ts'
import { ConflictError, ForbiddenError, InvalidInputError, NotFoundError } from './errors.ts'
import { accessTokenFor } from './google-accounts.ts'
import { isWritable } from './google-calendars.ts'
import { applyEvents } from './google-sync.ts'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export type CalendarEvent = {
  id: string
  calendarId: string
  /** Цвет календаря, к которому событие относится: у события своего цвета нет. */
  color: string
  title: string | null
  allDay: boolean
  startsAt: Date | null
  endsAt: Date | null
  startDate: string | null
  endDate: string | null
  recurringEventId: string | null
}

/** Событие изнутри, для панели правки: то же, что в сетке, плюс описание и календарь. */
export type CalendarEventDetails = CalendarEvent & {
  /** Описание обычным текстом: разметку Google в поле правки показывать нечего. */
  description: string | null
  calendarTitle: string
  /** Ссылка в Google: единственный способ добраться до серии, ADR-004. */
  htmlLink: string | null
}

/** Правка события снаружи: описание приходит текстом, разметку из него делает сервис. */
export type EventChanges = {
  title?: string | null
  description?: string | null
  times?: EventTimes
}

export type EventWriteResult = {
  eventId: string
  /** Правку пришлось накладывать заново: событие успели поправить в Google. */
  conflict: boolean
  /** Событие в Google отменено или стёрто — правка не применялась. */
  goneInGoogle: boolean
}

const EVENT = {
  id: calendarEvents.id,
  calendarId: calendarEvents.calendarId,
  googleEventId: calendarEvents.googleEventId,
  etag: calendarEvents.etag,
  deletedAt: calendarEvents.deletedAt,
  googleCalendarId: googleCalendars.googleCalendarId,
  accountId: googleCalendars.accountId,
}

const LISTED = {
  id: calendarEvents.id,
  calendarId: calendarEvents.calendarId,
  color: googleCalendars.color,
  title: calendarEvents.title,
  allDay: calendarEvents.allDay,
  startsAt: calendarEvents.startsAt,
  endsAt: calendarEvents.endsAt,
  startDate: calendarEvents.startDate,
  endDate: calendarEvents.endDate,
  recurringEventId: calendarEvents.recurringEventId,
}

const DETAILED = {
  ...LISTED,
  descriptionHtml: calendarEvents.descriptionHtml,
  calendarTitle: googleCalendars.title,
  htmlLink: calendarEvents.htmlLink,
}

/**
 * События видимых календарей, задевающие окно из московских дат (обе границы включительно).
 *
 * Пары времени разведены: у события со временем окно берётся моментами, у события на весь
 * день — датами как строками, без всякого перевода в момент. Инвариант 3: дата, прошедшая
 * через часовой пояс, уезжает на сутки.
 */
export async function listEvents(from: string, to: string): Promise<CalendarEvent[]> {
  if (!DATE.test(from) || !DATE.test(to)) {
    throw new InvalidInputError('границы окна — даты вида 2026-09-02')
  }
  if (to < from) throw new InvalidInputError('окно кончается не раньше, чем начинается')

  // граница окна исключающая с обеих сторон: событие, кончающееся ровно в полночь, к
  // следующему дню уже не относится
  const after = addDays(to, 1)
  const windowStart = momentInMoscow(from, '00:00')
  const windowEnd = momentInMoscow(after, '00:00')

  const rows = await db
    .select(LISTED)
    .from(calendarEvents)
    .innerJoin(googleCalendars, eq(googleCalendars.id, calendarEvents.calendarId))
    .where(
      and(
        eq(googleCalendars.visible, true),
        isNull(calendarEvents.deletedAt),
        ne(calendarEvents.status, 'cancelled'),
        // зеркало тайм-блока на сетке уже нарисовано самим блоком: показать его ещё и
        // событием значило бы удвоить одно намерение
        notExists(
          db
            .select({ mirror: sql`1` })
            .from(timeBlocks)
            .where(
              and(
                eq(timeBlocks.calendarId, calendarEvents.calendarId),
                eq(timeBlocks.googleEventId, calendarEvents.googleEventId),
              ),
            ),
        ),
        or(
          and(lt(calendarEvents.startsAt, windowEnd), gt(calendarEvents.endsAt, windowStart)),
          and(lt(calendarEvents.startDate, after), gt(calendarEvents.endDate, from)),
        ),
      ),
    )
    // сортировка по московскому дню, внутри дня события на весь день идут первыми
    .orderBy(
      sql`coalesce(${calendarEvents.startDate}, (${calendarEvents.startsAt} at time zone 'Europe/Moscow')::date) asc`,
      sql`${calendarEvents.startsAt} asc nulls first`,
    )

  return rows.map((row) => ({ ...row, color: row.color ?? DEFAULT_CALENDAR_COLOR }))
}

/**
 * Одно событие целиком. Отменённое и мягко удалённое не отдаётся: править его нечем, а
 * панель, открытая на нём, писала бы в пустоту.
 */
export async function getEvent(id: string): Promise<CalendarEventDetails> {
  const [row] = await db
    .select(DETAILED)
    .from(calendarEvents)
    .innerJoin(googleCalendars, eq(googleCalendars.id, calendarEvents.calendarId))
    .where(
      and(
        eq(calendarEvents.id, id),
        isNull(calendarEvents.deletedAt),
        ne(calendarEvents.status, 'cancelled'),
      ),
    )
  if (!row) throw new NotFoundError(`события ${id} нет`)

  const { descriptionHtml: html, ...event } = row
  return {
    ...event,
    color: event.color ?? DEFAULT_CALENDAR_COLOR,
    description: html === null ? null : descriptionText(html),
  }
}

function checkTimes(times: EventTimes): void {
  if (times.allDay) {
    if (!DATE.test(times.startDate) || !DATE.test(times.endDate)) {
      throw new InvalidInputError('дата события на весь день — строка вида 2026-09-02')
    }
    // граница у Google исключающая: сутки на весь день это следующая дата, а не та же
    if (times.endDate <= times.startDate) {
      throw new InvalidInputError('событие на весь день кончается позже дня, в который начинается')
    }
    return
  }

  if (Number.isNaN(times.startsAt.getTime()) || Number.isNaN(times.endsAt.getTime())) {
    throw new InvalidInputError('время события — годный момент')
  }
  if (times.endsAt <= times.startsAt) {
    throw new InvalidInputError('событие кончается позже, чем начинается')
  }
}

function normalize(changes: EventChanges): EventPatch {
  const patch: EventPatch = {}
  if ('title' in changes) patch.title = changes.title?.trim() || null
  // пустое описание и снятое — одно и то же: разметки из пустой строки не выходит
  if ('description' in changes) patch.descriptionHtml = descriptionHtml(changes.description ?? '')
  if (changes.times) {
    checkTimes(changes.times)
    patch.times = changes.times
  }

  if (Object.keys(patch).length === 0) throw new InvalidInputError('править нечего')
  return patch
}

/**
 * Новое событие в выбранном календаре: сначала в Google, потом к нам. Своего
 * идентификатора мы не придумываем — событие приезжает обратно тем же путём, что и из
 * синхронизации, и ложится в базу одним и тем же кодом.
 */
export async function createEvent(
  calendarId: string,
  draft: EventDraft,
): Promise<{ eventId: string }> {
  checkTimes(draft.times)

  const [calendar] = await db
    .select({
      googleCalendarId: googleCalendars.googleCalendarId,
      accountId: googleCalendars.accountId,
      accessRole: googleCalendars.accessRole,
    })
    .from(googleCalendars)
    .where(eq(googleCalendars.id, calendarId))
  if (!calendar) throw new NotFoundError(`календаря ${calendarId} нет`)
  if (!isWritable(calendar.accessRole)) {
    throw new ForbiddenError('в этот календарь Google писать нельзя: он открыт только на чтение')
  }

  const accessToken = await accessTokenFor(calendar.accountId)
  const event = await insertEvent(accessToken, calendar.googleCalendarId, {
    title: draft.title?.trim() || null,
    times: draft.times,
  })
  await applyEvents(calendarId, [event])

  const [row] = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.calendarId, calendarId),
        eq(calendarEvents.googleEventId, event.googleEventId),
      ),
    )
  if (!row) throw new ConflictError('Google завёл событие, но записать его к себе не вышло')

  return { eventId: row.id }
}

/** Событие, стёртое в Google насовсем: помечается тем же путём, что и присланная отмена. */
function goneEvent(googleEventId: string): GoogleEvent {
  return {
    googleEventId,
    status: 'cancelled',
    title: null,
    descriptionHtml: null,
    etag: null,
    googleUpdatedAt: null,
    recurringEventId: null,
    htmlLink: null,
    times: null,
  }
}

function reportConflict(googleEventId: string, ours: EventPatch, theirs: GoogleEvent | null): void {
  const when = theirs?.googleUpdatedAt?.toISOString() ?? 'неизвестно когда'
  const what = theirs ? `правка в Google от ${when}` : 'событие стёрто в Google'
  console.warn(
    `конфликт записи события ${googleEventId}: ${what}, наш etag устарел;` +
      ` наши поля: ${Object.keys(ours).join(', ')}`,
  )
}

/** Событие вместе с тем, что нужно для похода в Google: календарь, аккаунт, `etag`. */
async function locateEvent(id: string) {
  const [event] = await db
    .select(EVENT)
    .from(calendarEvents)
    .innerJoin(googleCalendars, eq(googleCalendars.id, calendarEvents.calendarId))
    .where(eq(calendarEvents.id, id))
  if (!event || event.deletedAt) throw new NotFoundError(`события ${id} нет`)

  return event
}

/**
 * Правка события в Google: `PATCH` с `If-Match`. На `412` событие перечитывается, чужая
 * версия ложится в базу, и правка накладывается поверх неё вторым `PATCH` — правило
 * «выигрывает более свежая правка» из `02-technical.md`, раздел 4: наша правка приходит
 * сейчас, то есть она и есть более свежая. Чужие поля при этом остаются чужими: `PATCH`
 * несёт только то, что правим.
 *
 * Повторяющееся событие правится вхождением, а не серией: у нас лежит развёрнутый
 * экземпляр со своим идентификатором, ADR-004.
 */
export async function updateEvent(id: string, changes: EventChanges): Promise<EventWriteResult> {
  const patch = normalize(changes)
  const event = await locateEvent(id)
  const accessToken = await accessTokenFor(event.accountId)

  try {
    const written = await patchEvent(
      accessToken,
      event.googleCalendarId,
      event.googleEventId,
      patch,
      event.etag,
    )
    await applyEvents(event.calendarId, [written])
    return { eventId: id, conflict: false, goneInGoogle: false }
  } catch (error) {
    if (!(error instanceof EventEtagMismatchError)) throw error
  }

  const current = await fetchEvent(accessToken, event.googleCalendarId, event.googleEventId)
  reportConflict(event.googleEventId, patch, current)

  // отменённое в Google событие правкой не воскрешаем: у нас нет ни просьбы об этом, ни
  // способа отличить отмену от переноса в другой календарь
  if (!current || current.status === 'cancelled') {
    await applyEvents(event.calendarId, [current ?? goneEvent(event.googleEventId)])
    return { eventId: id, conflict: true, goneInGoogle: true }
  }

  await applyEvents(event.calendarId, [current])

  try {
    const written = await patchEvent(
      accessToken,
      event.googleCalendarId,
      event.googleEventId,
      patch,
      current.etag,
    )
    await applyEvents(event.calendarId, [written])
    return { eventId: id, conflict: true, goneInGoogle: false }
  } catch (error) {
    // второй подряд 412 — событие правят прямо сейчас; крутить цикл дальше некуда
    if (error instanceof EventEtagMismatchError) {
      throw new ConflictError(`событие ${event.googleEventId} правят в Google, правка не записана`)
    }
    throw error
  }
}

/**
 * Удаление события: сначала в Google, потом у себя. Событие гасится тем же путём, что и
 * присланная отмена, — иначе следующая синхронизация вернула бы его на сетку.
 *
 * Из Google событие не вернуть, поэтому подтверждение спрашивает интерфейс. Повторяющееся
 * удаляется вхождением, а не серией, — ADR-004: у нас лежит развёрнутый экземпляр.
 */
export async function removeEvent(id: string): Promise<{ eventId: string }> {
  const event = await locateEvent(id)
  const accessToken = await accessTokenFor(event.accountId)

  await deleteEvent(accessToken, event.googleCalendarId, event.googleEventId)
  await applyEvents(event.calendarId, [goneEvent(event.googleEventId)])

  return { eventId: id }
}
