'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ChecklistView } from '@/server/services/checklists'
import { sendJson } from './api-client'
import { boardKey } from './board-query'
import { applyItemMove, type ItemMovePlan } from './checklist-move'
import { checklistsKey } from './checklist-query'

/**
 * После правки перечитываются и чек-листы карточки, и доска: на карточке в колонке
 * стоит счётчик прогресса, и он меняется от любой отметки, удаления и добавления.
 */
function useChecklistChange<T = void>(
  boardId: string,
  cardId: string,
  request: (input: T) => Promise<unknown>,
) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
      void client.invalidateQueries({ queryKey: checklistsKey(cardId) })
    },
  })
}

export const useCreateChecklist = (boardId: string, cardId: string) =>
  useChecklistChange(boardId, cardId, (title: string) =>
    sendJson('POST', `/api/cards/${cardId}/checklists`, { title }),
  )

export const useRenameChecklist = (boardId: string, cardId: string, checklistId: string) =>
  useChecklistChange(boardId, cardId, (title: string) =>
    sendJson('PATCH', `/api/checklists/${checklistId}`, { title }),
  )

export const useDeleteChecklist = (boardId: string, cardId: string, checklistId: string) =>
  useChecklistChange(boardId, cardId, () => sendJson('DELETE', `/api/checklists/${checklistId}`))

export const useAddChecklistItem = (boardId: string, cardId: string, checklistId: string) =>
  useChecklistChange(boardId, cardId, (title: string) =>
    sendJson('POST', `/api/checklists/${checklistId}/items`, { title }),
  )

export const useUpdateChecklistItem = (boardId: string, cardId: string, itemId: string) =>
  useChecklistChange(boardId, cardId, (patch: { title?: string; done?: boolean }) =>
    sendJson('PATCH', `/api/checklist-items/${itemId}`, patch),
  )

export const useDeleteChecklistItem = (boardId: string, cardId: string, itemId: string) =>
  useChecklistChange(boardId, cardId, () => sendJson('DELETE', `/api/checklist-items/${itemId}`))

export type ItemMoveInput = ItemMovePlan & { itemId: string }

/**
 * Перестановка пункта: оптимистично, как и у карточки, — задержка под курсором видна
 * глазом. Ранг с клиента не уходит, только соседи.
 */
export function useMoveChecklistItem(boardId: string, cardId: string) {
  const client = useQueryClient()
  const key = checklistsKey(cardId)

  return useMutation({
    mutationFn: ({ itemId, ...plan }: ItemMoveInput) =>
      sendJson('PATCH', `/api/checklist-items/${itemId}`, plan),

    onMutate: async ({ itemId, ...plan }) => {
      await client.cancelQueries({ queryKey: key })

      const previous = client.getQueryData<ChecklistView[]>(key)
      if (previous) client.setQueryData(key, applyItemMove(previous, itemId, plan))
      return { previous }
    },

    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: key })
      // прогресс на карточке в колонке считает сервер: доска перечитывается всегда
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
    },
  })
}
