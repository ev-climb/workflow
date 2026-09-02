const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars'

/** ADR-008: окно полной синхронизации. Назад — месяц, вперёд — год от момента запроса. */
export const FULL_SYNC_DAYS_BACK = 30
export const FULL_SYNC_DAYS_AHEAD = 365

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled'

/** Ровно одна пара времени, инвариант 3. Дата события на весь день не знает часовых поясов. */
export type EventTimes =
  | { allDay: true; startDate: string; endDate: string; startsAt: null; endsAt: null }
  | { allDay: false; startsAt: Date; endsAt: Date; startDate: null; endDate: null }

export type GoogleEvent = {
  googleEventId: string
  status: EventStatus
  title: string | null
  /** Google отдаёт описание разметкой HTML, а не текстом, — в отличие от карточки. */
  descriptionHtml: string | null
  etag: string | null
  googleUpdatedAt: Date | null
  /** Идентификатор серии на стороне Google у экземпляра повторяющегося события. */
  recurringEventId: string | null
  /** У отменённого события Google присылает только идентификатор и статус — времени нет. */
  times: EventTimes | null
}

export type EventPage = {
  events: GoogleEvent[]
  nextSyncToken: string | null
}

/** Отказ календарного API. Тело в сообщение целиком не идёт: берём только поля ошибки. */
export class GoogleApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** `410 GONE`: наш токен протух. Штатная ситуация — обнулить и уйти в полную синхронизацию. */
export class SyncTokenExpiredError extends GoogleApiError {}

/**
 * `400 Invalid sync token value`: Google не признаёт токен своим. Восстановление такое же,
 * как у `410`, но это признак того, что мы записали мусор, и молчать о нём нельзя.
 */
export class SyncTokenRejectedError extends GoogleApiError {}

/**
 * `412`: наш `etag` устарел, событие успели поправить в Google. Не ошибка записи — сигнал
 * перечитать событие и решить конфликт, `02-technical.md`, раздел 4, правило 5.
 */
export class EventEtagMismatchError extends GoogleApiError {}

type EventTime = { date?: string; dateTime?: string }

type EventItem = {
  id?: string
  status?: string
  etag?: string
  summary?: string
  description?: string
  updated?: string
  start?: EventTime
  end?: EventTime
  recurringEventId?: string
}

type ListResponse = {
  items?: EventItem[]
  nextPageToken?: string
  nextSyncToken?: string
}

// арифметика по календарным датам идёт в UTC, где сутки всегда ровно 24 часа: разбор
// такой даты в поясе процесса сдвинул бы событие на весь день на сутки
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const at = new Date(Date.UTC(year, month - 1, day))
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

function statusOf(value: string | undefined): EventStatus {
  return value === 'cancelled' || value === 'tentative' ? value : 'confirmed'
}

function timesOf(start: EventTime | undefined, end: EventTime | undefined): EventTimes | null {
  if (start?.date && end?.date) {
    // end.date у Google исключающая, но равную началу он принимает и возвращает как есть;
    // такое событие имеет нулевую длину, поэтому выправляется здесь, а не хранится
    const endDate = end.date > start.date ? end.date : addDays(start.date, 1)
    return { allDay: true, startDate: start.date, endDate, startsAt: null, endsAt: null }
  }

  if (start?.dateTime && end?.dateTime) {
    const startsAt = new Date(start.dateTime)
    const endsAt = new Date(end.dateTime)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null
    return {
      allDay: false,
      startsAt,
      endsAt: endsAt < startsAt ? startsAt : endsAt,
      startDate: null,
      endDate: null,
    }
  }

  return null
}

/**
 * Событие Google в нашу форму. Времени может не быть вовсе — у отменённого события
 * дельта приносит один идентификатор со статусом, и это не ошибка разбора.
 */
export function mapEvent(item: EventItem): GoogleEvent | null {
  if (!item.id) return null

  const updated = item.updated ? new Date(item.updated) : null

  return {
    googleEventId: item.id,
    status: statusOf(item.status),
    title: item.summary ?? null,
    descriptionHtml: item.description ?? null,
    etag: item.etag ?? null,
    googleUpdatedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null,
    recurringEventId: item.recurringEventId ?? null,
    times: timesOf(item.start, item.end),
  }
}

function fail(status: number, body: string): GoogleApiError {
  let reason = `код ${status}`
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    if (parsed.error?.message) reason = parsed.error.message
  } catch {
    // не JSON — остаётся код ответа
  }

  const message = `Google отказал (события календаря): ${reason}`
  if (status === 410) return new SyncTokenExpiredError(message, status)
  if (status === 412) return new EventEtagMismatchError(message, status)
  if (status === 400 && /sync token/i.test(reason)) return new SyncTokenRejectedError(message, status)
  return new GoogleApiError(message, status)
}

function fullSyncWindow(now: Date): { timeMin: string; timeMax: string } {
  const timeMin = new Date(now)
  timeMin.setUTCDate(timeMin.getUTCDate() - FULL_SYNC_DAYS_BACK)
  const timeMax = new Date(now)
  timeMax.setUTCDate(timeMax.getUTCDate() + FULL_SYNC_DAYS_AHEAD)
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() }
}

/**
 * Все события календаря одним проходом по страницам. Без `syncToken` — полная выборка в
 * окне ADR-008; с токеном — дельта, и окно ей не задаётся: вместе с `syncToken` Google
 * отвечает на `timeMax` четырёхсотым.
 *
 * `singleEvents=true` — ADR-004: повторы разворачивает Google, своего движка правил у нас
 * нет. Параметр обязан совпадать с тем, при котором получен токен.
 */
export async function fetchEvents(
  accessToken: string,
  googleCalendarId: string,
  syncToken: string | null,
  now: Date = new Date(),
): Promise<EventPage> {
  const events: GoogleEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | null = null

  do {
    const url = new URL(`${CALENDAR_API}/${encodeURIComponent(googleCalendarId)}/events`)
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('maxResults', '250')
    if (syncToken) {
      url.searchParams.set('syncToken', syncToken)
    } else {
      const { timeMin, timeMax } = fullSyncWindow(now)
      url.searchParams.set('timeMin', timeMin)
      url.searchParams.set('timeMax', timeMax)
    }
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
    const body = await response.text()
    if (!response.ok) throw fail(response.status, body)

    const page = JSON.parse(body) as ListResponse
    for (const item of page.items ?? []) {
      const event = mapEvent(item)
      if (event) events.push(event)
    }

    pageToken = page.nextPageToken
    nextSyncToken = page.nextSyncToken ?? null
  } while (pageToken)

  return { events, nextSyncToken }
}

/** Правка события: поле отсутствует — не трогаем, `null` — стираем. */
export type EventPatch = {
  title?: string | null
  descriptionHtml?: string | null
  times?: EventTimes
}

function timeBody(times: EventTimes, edge: 'start' | 'end'): EventTime {
  if (times.allDay) return { date: edge === 'start' ? times.startDate : times.endDate }
  return { dateTime: (edge === 'start' ? times.startsAt : times.endsAt).toISOString() }
}

function patchBody(patch: EventPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if ('title' in patch) body.summary = patch.title
  if ('descriptionHtml' in patch) body.description = patch.descriptionHtml
  if (patch.times) {
    // вложенный объект Google в patch заменяет целиком, поэтому смена вида времени
    // (весь день ↔ со временем) не требует отдельно гасить чужую пару полей
    body.start = timeBody(patch.times, 'start')
    body.end = timeBody(patch.times, 'end')
  }
  return body
}

function eventUrl(googleCalendarId: string, googleEventId: string): string {
  return `${CALENDAR_API}/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(googleEventId)}`
}

/** Одно событие. `null` — Google о таком не знает: событие стёрли насовсем. */
export async function fetchEvent(
  accessToken: string,
  googleCalendarId: string,
  googleEventId: string,
): Promise<GoogleEvent | null> {
  const response = await fetch(eventUrl(googleCalendarId, googleEventId), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const body = await response.text()
  if (response.status === 404) return null
  if (!response.ok) throw fail(response.status, body)

  return mapEvent(JSON.parse(body) as EventItem)
}

/**
 * Запись обратно: `PATCH` с `If-Match`. Устаревший `etag` даёт `412` — разрешение конфликта
 * не здесь, а в сервисе. Без `etag` заголовок не ставится: перезаписать вслепую всё же лучше,
 * чем не уметь записать событие, у которого его нет.
 */
export async function patchEvent(
  accessToken: string,
  googleCalendarId: string,
  googleEventId: string,
  patch: EventPatch,
  etag: string | null,
): Promise<GoogleEvent> {
  const response = await fetch(eventUrl(googleCalendarId, googleEventId), {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(etag ? { 'if-match': etag } : {}),
    },
    body: JSON.stringify(patchBody(patch)),
  })
  const body = await response.text()
  if (!response.ok) throw fail(response.status, body)

  const event = mapEvent(JSON.parse(body) as EventItem)
  if (!event) throw new GoogleApiError('Google вернул событие без идентификатора', response.status)
  return event
}
