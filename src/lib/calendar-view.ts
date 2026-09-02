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
