'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { archiveKey } from './archive-query'
import { boardKey } from './board-query'
import { calendarKey, duesKey } from './calendar-query'
import { cardsKey } from './card-query'

/**
 * Подписка на поток `/api/events`: доска, изменённая в другой вкладке или через MCP, и
 * календарь, приехавший синхронизацией, перечитываются сами. Только инвалидация —
 * записывать в кэш нельзя, иначе ответ, отставший на шаг, затрёт оптимистично
 * переложенную карточку.
 */
export function useBoardEvents(): void {
  const client = useQueryClient()

  useEffect(() => {
    const source = new EventSource('/api/events')

    source.addEventListener('board-changed', (event) => {
      const { boardId } = JSON.parse((event as MessageEvent<string>).data) as { boardId: string }
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
      void client.invalidateQueries({ queryKey: archiveKey(boardId) })
      // какая карточка открыта в панели, здесь неизвестно, а открыта она в лучшем случае одна
      void client.invalidateQueries({ queryKey: cardsKey })
      void client.invalidateQueries({ queryKey: duesKey })
    })

    source.addEventListener('calendar-changed', () => {
      void client.invalidateQueries({ queryKey: calendarKey })
    })

    return () => source.close()
  }, [client])
}
