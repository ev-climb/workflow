'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendJson } from './api-client'
import { boardKey } from './board-query'

/**
 * После правки доска перечитывается целиком. Оптимистично обновляется только
 * перетаскивание: там задержка видна глазом, а здесь поле и так закрывается сразу.
 */
function useBoardChange(boardId: string, request: (title: string) => Promise<unknown>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => client.invalidateQueries({ queryKey: boardKey(boardId) }),
  })
}

export const useCreateList = (boardId: string) =>
  useBoardChange(boardId, (title) => sendJson('POST', `/api/boards/${boardId}/lists`, { title }))

export const useRenameList = (boardId: string, listId: string) =>
  useBoardChange(boardId, (title) => sendJson('PATCH', `/api/lists/${listId}`, { title }))

export const useCreateCard = (boardId: string, listId: string) =>
  useBoardChange(boardId, (title) => sendJson('POST', `/api/lists/${listId}/cards`, { title }))

export const useRenameCard = (boardId: string, cardId: string) =>
  useBoardChange(boardId, (title) => sendJson('PATCH', `/api/cards/${cardId}`, { title }))
