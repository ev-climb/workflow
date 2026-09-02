import { getJson } from './api-client'
import type { CalendarEventView } from './calendar-view'

/** Корень ключа: по нему разом инвалидируются все прочитанные окна сетки. */
export const calendarKey = ['calendar'] as const

export function calendarQuery(from: string, to: string) {
  return {
    queryKey: [...calendarKey, from, to] as const,
    queryFn: (): Promise<CalendarEventView[]> =>
      getJson<CalendarEventView[]>(`/api/calendar/events?from=${from}&to=${to}`),
  }
}
