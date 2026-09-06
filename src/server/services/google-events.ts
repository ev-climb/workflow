import { and, eq, gt, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm'
import { DEFAULT_CALENDAR_COLOR } from '../../lib/calendar-colors.ts'
import { isDay } from '../../lib/dates.ts'
import { descriptionHtml, descriptionText } from '../../lib/event-description.ts'
import { db } from '../db/client.ts'
import {
  boards,
  calendarEvents,
  cards,
  googleAccounts,
  googleCalendars,
  googleTasks,
  lists,
  timeBlocks,
} from '../db/schema.ts'
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
import { parseDayWindow } from './day-window.ts'
import { ConflictError, ForbiddenError, InvalidInputError, NotFoundError } from './errors.ts'
import { accessTokenFor } from './google-accounts.ts'
import { isWritable } from './google-calendars.ts'
import { writeThroughEtag } from './google-shared.ts'
import { applyEvents } from './google-sync.ts'

export type CalendarEvent = {
  id: string
  calendarId: string
  /** Цвет аккаунта, а если у календаря выбран свой — его: события своего цвета не имеют. */
  color: string
  title: string | null
  allDay: boolean
  startsAt: Date | null
  endsAt: Date | null
  startDate: string | null
  endDate: string | null
  recurringEventId: string | null
  /**
   * Задача Google, зеркалом которой событие является: ADR-013. У такого события есть
   * чекбокс, и закрывает он задачу, а не событие. У обычного события — `null`.
   */
  taskId: string | null
  taskCompleted: boolean | null
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
  color: sql<string | null>`coalesce(${googleCalendars.color}, ${googleAccounts.color})`,
  title: calendarEvents.title,
  allDay: calendarEvents.allDay,
  startsAt: calendarEvents.startsAt,
  endsAt: calendarEvents.endsAt,
  startDate: calendarEvents.startDate,
  endDate: calendarEvents.endDate,
  recurringEventId: calendarEvents.recurringEventId,
  taskId: googleTasks.id,
  taskStatus: googleTasks.status,
}

/**
 * Зеркало задачи и сама задача — одна запись Google, разложенная у нас по двум таблицам.
 * Связь через идентификатор задачи, вынутый из описания зеркала, и всегда внутри одного
 * аккаунта: у двух аккаунтов идентификаторы задач независимы.
 */
const mirroredTask = and(
  eq(googleTasks.accountId, googleCalendars.accountId),
  eq(googleTasks.googleTaskId, calendarEvents.googleTaskId),
  isNull(googleTasks.deletedAt),
)

function withTask<T extends { color: string | null; taskStatus: string | null }>(row: T) {
  const { taskStatus, ...rest } = row
  return {
    ...rest,
    color: rest.color ?? DEFAULT_CALENDAR_COLOR,
    taskCompleted: taskStatus === null ? null : taskStatus === 'completed',
  }
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
  // граница окна исключающая с обеих сторон: событие, кончающееся ровно в полночь, к
  // следующему дню уже не относится
  const { after, start: windowStart, end: windowEnd } = parseDayWindow(from, to)

  const rows = await db
    .select(LISTED)
    .from(calendarEvents)
    .innerJoin(googleCalendars, eq(googleCalendars.id, calendarEvents.calendarId))
    .innerJoin(googleAccounts, eq(googleAccounts.id, googleCalendars.accountId))
    .leftJoin(googleTasks, mirroredTask)
    .where(
      and(
        eq(googleCalendars.visible, true),
        isNull(calendarEvents.deletedAt),
        ne(calendarEvents.status, 'cancelled'),
        // зеркало тайм-блока на сетке уже нарисовано самим блоком: показать его ещё и
        // событием значило бы удвоить одно намерение. Условия на архив те же, что в
        // listTimeBlocks: разойдись они — событие пропало бы из обеих выдач разом
        notExists(
          db
            .select({ mirror: sql`1` })
            .from(timeBlocks)
            .innerJoin(cards, eq(timeBlocks.cardId, cards.id))
            .innerJoin(lists, eq(cards.listId, lists.id))
            .innerJoin(boards, eq(lists.boardId, boards.id))
            .where(
              and(
                eq(timeBlocks.calendarId, calendarEvents.calendarId),
                eq(timeBlocks.googleEventId, calendarEvents.googleEventId),
                isNull(cards.archivedAt),
                isNull(lists.archivedAt),
                isNull(boards.archivedAt),
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

  return rows.map(withTask)
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
    .innerJoin(googleAccounts, eq(googleAccounts.id, googleCalendars.accountId))
    .leftJoin(googleTasks, mirroredTask)
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
    ...withTask(event),
    description: html === null ? null : descriptionText(html),
  }
}

function checkTimes(times: EventTimes): void {
  if (times.allDay) {
    if (!isDay(times.startDate) || !isDay(times.endDate)) {
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
  draft: { title: string | null; description?: string | null; times: EventTimes },
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
    ...(draft.description === undefined
      ? {}
      : { descriptionHtml: descriptionHtml(draft.description ?? '') }),
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
    googleTaskId: null,
    times: null,
  }
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
 * Правка события в Google. Разрешение конфликта на `412` общее с задачами — оно в
 * `writeThroughEtag`.
 *
 * Повторяющееся событие правится вхождением, а не серией: у нас лежит развёрнутый
 * экземпляр со своим идентификатором, ADR-004.
 */
export async function updateEvent(id: string, changes: EventChanges): Promise<EventWriteResult> {
  const patch = normalize(changes)
  const event = await locateEvent(id)
  const accessToken = await accessTokenFor(event.accountId)

  const written = await writeThroughEtag({
    subject: { of: 'события', gone: 'событие стёрто в Google', edited: 'событие' },
    googleId: event.googleEventId,
    fields: Object.keys(patch),
    etag: event.etag,
    mismatch: EventEtagMismatchError,
    patch: (etag) =>
      patchEvent(accessToken, event.googleCalendarId, event.googleEventId, patch, etag),
    fetch: () => fetchEvent(accessToken, event.googleCalendarId, event.googleEventId),
    apply: async (remote) => {
      await applyEvents(event.calendarId, [remote])
    },
    gone: () => goneEvent(event.googleEventId),
    // отменённое в Google событие правкой не воскрешаем: у нас нет ни просьбы об этом, ни
    // способа отличить отмену от переноса в другой календарь
    cancelled: (remote) => remote.status === 'cancelled',
  })

  return { eventId: id, ...written }
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
