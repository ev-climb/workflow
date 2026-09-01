'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { archiveKey } from './archive-query'
import { boardKey } from './board-query'

/**
 * Подписка на поток `/api/events`: доска, изменённая в другой вкладке или через MCP,
 * перечитывается сама. Только инвалидация — записывать в кэш нельзя, иначе ответ,
 * отставший на шаг, затрёт оптимистично переложенную карточку.
 */
export function useBoardEvents(): void {
  const client = useQueryClient()

  useEffect(() => {
    const source = new EventSource('/api/events')

    source.addEventListener('board-changed', (event) => {
      const { boardId } = JSON.parse((event as MessageEvent<string>).data) as { boardId: string }
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
      void client.invalidateQueries({ queryKey: archiveKey(boardId) })
    })

    return () => source.close()
  }, [client])
}
