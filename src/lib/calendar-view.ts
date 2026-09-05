import type { EventTimes } from '@/server/google/events'
import type { CardDue } from '@/server/services/cards'
import type { GoogleAccountSummary } from '@/server/services/google-accounts'
import type { CalendarEvent, CalendarEventDetails } from '@/server/services/google-events'
import type { TimeBlock } from '@/server/services/time-blocks'

export type CalendarEventView = Omit<CalendarEvent, 'startsAt' | 'endsAt'> & {
  startsAt: string | null
  endsAt: string | null
}

/** Вид события для клиента: после JSON моменты становятся строками, даты не трогаются. */
export function toEventView(event: CalendarEvent): CalendarEventView {
  return {
    ...event,
    startsAt: event.startsAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
  }
}

export type CalendarEventDetailsView = CalendarEventView & {
  description: string | null
  calendarTitle: string
  htmlLink: string | null
}

/** Вид события для панели правки: та же сериализация плюс поля, которых нет в сетке. */
export function toEventDetailsView(event: CalendarEventDetails): CalendarEventDetailsView {
  const { description, calendarTitle, htmlLink, ...rest } = event
  return { ...toEventView(rest), description, calendarTitle, htmlLink }
}

/** Вид тайм-блока для клиента: та же пара моментов строками, что и у события со временем. */
export type TimeBlockView = Omit<TimeBlock, 'startsAt' | 'endsAt'> & {
  startsAt: string
  endsAt: string
}

export type CardDueView = Omit<CardDue, 'dueAt'> & { dueAt: string }

/** Вид срока для клиента: момент становится строкой, как и всюду после JSON. */
export function toDueView(due: CardDue): CardDueView {
  return { ...due, dueAt: due.dueAt.toISOString() }
}

/** Время события с клиента: пара дат у события на весь день, пара моментов у обычного. */
export type EventTimesInput =
  | { allDay: true; startDate: string; endDate: string }
  | { allDay: false; startsAt: string; endsAt: string }

/** Обратный перевод: моменты разбираются, даты события на весь день не трогаются — инвариант 3. */
export function toEventTimes(input: EventTimesInput): EventTimes {
  if (input.allDay) {
    return {
      allDay: true,
      startDate: input.startDate,
      endDate: input.endDate,
      startsAt: null,
      endsAt: null,
    }
  }

  return {
    allDay: false,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    startDate: null,
    endDate: null,
  }
}

export type GoogleAccountView = Omit<GoogleAccountSummary, 'connectedAt'> & {
  connectedAt: string
}

/** Вид аккаунта для клиента: момент подключения становится строкой, как и всюду после JSON. */
export function toAccountView(account: GoogleAccountSummary): GoogleAccountView {
  return { ...account, connectedAt: account.connectedAt.toISOString() }
}
