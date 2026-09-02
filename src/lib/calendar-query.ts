import { getJson } from './api-client'
import type { CalendarEventView, CardDueView } from './calendar-view'

/** Корень ключа: по нему разом инвалидируются все прочитанные окна сетки. */
export const calendarKey = ['calendar'] as const

export function calendarQuery(from: string, to: string) {
  return {
    queryKey: [...calendarKey, from, to] as const,
    queryFn: (): Promise<CalendarEventView[]> =>
      getJson<CalendarEventView[]>(`/api/calendar/events?from=${from}&to=${to}`),
  }
}

/**
 * Сроки читаются отдельно от событий: события меняет синхронизация с Google, сроки —
 * правка доски, и гасить чужой кэш на каждое из двух событий незачем.
 */
export const duesKey = ['calendar-dues'] as const

export function duesQuery(from: string, to: string) {
  return {
    queryKey: [...duesKey, from, to] as const,
    queryFn: (): Promise<CardDueView[]> =>
      getJson<CardDueView[]>(`/api/calendar/dues?from=${from}&to=${to}`),
  }
}
