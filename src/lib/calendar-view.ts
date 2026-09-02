import type { CardDue } from '@/server/services/cards'
import type { CalendarEvent } from '@/server/services/google-events'

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

export type CardDueView = Omit<CardDue, 'dueAt'> & { dueAt: string }

/** Вид срока для клиента: момент становится строкой, как и всюду после JSON. */
export function toDueView(due: CardDue): CardDueView {
  return { ...due, dueAt: due.dueAt.toISOString() }
}
