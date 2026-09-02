import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { calendarEvents, googleCalendars } from '../db/schema.ts'
import {
  EventEtagMismatchError,
  type EventPatch,
  type EventTimes,
  type GoogleEvent,
  fetchEvent,
  patchEvent,
} from '../google/events.ts'
import { ConflictError, InvalidInputError, NotFoundError } from './errors.ts'
import { accessTokenFor } from './google-accounts.ts'
import { applyEvents } from './google-sync.ts'

const DATE = /^\d{4}-\d{2}-\d{2}$/

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

function normalize(changes: EventPatch): EventPatch {
  const patch: EventPatch = {}
  if ('title' in changes) patch.title = changes.title?.trim() || null
  if ('descriptionHtml' in changes) patch.descriptionHtml = changes.descriptionHtml?.trim() || null
  if (changes.times) {
    checkTimes(changes.times)
    patch.times = changes.times
  }

  if (Object.keys(patch).length === 0) throw new InvalidInputError('править нечего')
  return patch
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
export async function updateEvent(id: string, changes: EventPatch): Promise<EventWriteResult> {
  const patch = normalize(changes)

  const [event] = await db
    .select(EVENT)
    .from(calendarEvents)
    .innerJoin(googleCalendars, eq(googleCalendars.id, calendarEvents.calendarId))
    .where(eq(calendarEvents.id, id))
  if (!event || event.deletedAt) throw new NotFoundError(`события ${id} нет`)

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
