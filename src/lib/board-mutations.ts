'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendJson } from './api-client'
import { archiveKey } from './archive-query'
import { boardKey } from './board-query'

/**
 * После правки доска перечитывается целиком. Оптимистично обновляется только
 * перетаскивание: там задержка видна глазом, а здесь поле и так закрывается сразу.
 * Архив перечитывается вместе с доской: любая правка перекладывает элемент между ними.
 */
function useBoardChange<T = void>(boardId: string, request: (input: T) => Promise<unknown>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
      void client.invalidateQueries({ queryKey: archiveKey(boardId) })
    },
  })
}

export const useCreateList = (boardId: string) =>
  useBoardChange(boardId, (title: string) =>
    sendJson('POST', `/api/boards/${boardId}/lists`, { title }),
  )

export const useRenameList = (boardId: string, listId: string) =>
  useBoardChange(boardId, (title: string) => sendJson('PATCH', `/api/lists/${listId}`, { title }))

export const useCreateCard = (boardId: string, listId: string) =>
  useBoardChange(boardId, (title: string) =>
    sendJson('POST', `/api/lists/${listId}/cards`, { title }),
  )

export const useRenameCard = (boardId: string, cardId: string) =>
  useBoardChange(boardId, (title: string) => sendJson('PATCH', `/api/cards/${cardId}`, { title }))

const setArchived = (url: string, archived: boolean) => () => sendJson('PATCH', url, { archived })

export const useArchiveList = (boardId: string, listId: string) =>
  useBoardChange(boardId, setArchived(`/api/lists/${listId}`, true))

export const useRestoreList = (boardId: string, listId: string) =>
  useBoardChange(boardId, setArchived(`/api/lists/${listId}`, false))

export const useArchiveCard = (boardId: string, cardId: string) =>
  useBoardChange(boardId, setArchived(`/api/cards/${cardId}`, true))

export const useRestoreCard = (boardId: string, cardId: string) =>
  useBoardChange(boardId, setArchived(`/api/cards/${cardId}`, false))
