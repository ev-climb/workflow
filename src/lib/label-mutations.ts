'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendJson } from './api-client'
import { boardKey } from './board-query'
import { cardsKey } from './card-query'

export type LabelInput = { name: string; color: string }

/**
 * Метка лежит в наборе доски и висит на карточках, поэтому после правки перечитывается
 * и доска, и открытая карточка. Удаление снимает метку со всех карточек сразу — обхода
 * на клиенте нет, доска приезжает уже без неё.
 */
function useLabelChange<T>(boardId: string, request: (input: T) => Promise<unknown>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
      void client.invalidateQueries({ queryKey: cardsKey })
    },
  })
}

export const useCreateLabel = (boardId: string) =>
  useLabelChange(boardId, (input: LabelInput) =>
    sendJson('POST', `/api/boards/${boardId}/labels`, input),
  )

export const useUpdateLabel = (boardId: string, labelId: string) =>
  useLabelChange(boardId, (patch: Partial<LabelInput>) =>
    sendJson('PATCH', `/api/labels/${labelId}`, patch),
  )

export const useDeleteLabel = (boardId: string, labelId: string) =>
  useLabelChange(boardId, () => sendJson('DELETE', `/api/labels/${labelId}`))
