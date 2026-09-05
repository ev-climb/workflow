'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { accountsKey, calendarKey, calendarsKey } from '@/lib/calendar-query'

/**
 * Перечитывание после правки в настройках. Гасится и сетка: цвет события берётся из
 * календаря, а спрятанный календарь уходит с неё целиком.
 */
export function useSettingsRefresh(): () => void {
  const client = useQueryClient()

  return useCallback(() => {
    for (const key of [accountsKey, calendarsKey, calendarKey]) {
      void client.invalidateQueries({ queryKey: key })
    }
  }, [client])
}
