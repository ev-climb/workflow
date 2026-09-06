'use client'

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { sendJson } from './api-client'
import { accountsKey, calendarRoots, calendarsKey } from './calendar-query'

/**
 * После правки в настройках перечитываются оба списка и календарь целиком: цвет события
 * берётся из календаря, спрятанный календарь уходит с сетки, а зеркала тайм-блоков живут
 * в отключаемом аккаунте. Смена цвета аккаунта снимает выбор с его календарей — это делает
 * сервис, поэтому список календарей гасится и здесь.
 */
function refreshSettings(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: accountsKey }),
    client.invalidateQueries({ queryKey: calendarsKey }),
    ...calendarRoots.map((key) => client.invalidateQueries({ queryKey: key })),
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

/**
 * Отключение аккаунта уносит его календари, события и задачи, а тайм-блоки теряют
 * зеркала: перечитываются те же списки и сетка, что и после любой правки настроек.
 */
export const useDisconnectAccount = (accountId: string) =>
  useSettingsChange(() => sendJson('DELETE', `/api/google/accounts/${accountId}`))

export type CalendarPatch = { color?: string | null; visible?: boolean }

export const useUpdateCalendar = (calendarId: string) =>
  useSettingsChange((patch: CalendarPatch) =>
    sendJson('PATCH', `/api/google/calendars/${calendarId}`, patch),
  )
