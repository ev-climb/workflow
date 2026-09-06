'use client'

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { sendJson } from './api-client'
import { accountsKey, calendarKey, calendarsKey } from './calendar-query'

/**
 * После правки в настройках перечитываются оба списка и сетка: цвет события берётся из
 * календаря, а спрятанный календарь уходит с неё целиком. Смена цвета аккаунта снимает
 * выбор с его календарей — это делает сервис, поэтому список календарей гасится и здесь.
 */
function refreshSettings(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: accountsKey }),
    client.invalidateQueries({ queryKey: calendarsKey }),
    client.invalidateQueries({ queryKey: calendarKey }),
  ])
}

function useSettingsChange<T>(request: (input: T) => Promise<unknown>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => void refreshSettings(client),
  })
}

export const useSetAccountColor = (accountId: string) =>
  useSettingsChange((color: string) =>
    sendJson('PATCH', `/api/google/accounts/${accountId}`, { color }),
  )

export type CalendarPatch = { color?: string | null; visible?: boolean }

export const useUpdateCalendar = (calendarId: string) =>
  useSettingsChange((patch: CalendarPatch) =>
    sendJson('PATCH', `/api/google/calendars/${calendarId}`, patch),
  )
