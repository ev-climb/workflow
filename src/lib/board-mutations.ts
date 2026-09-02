'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendJson } from './api-client'
import { archiveKey } from './archive-query'
import { applyListMove, applyMove, type ListMovePlan, type MovePlan } from './board-move'
import { boardKey } from './board-query'
import { duesKey } from './calendar-query'
import type { BoardView } from './board-view'
import { cardsKey } from './card-query'

/**
 * После правки доска перечитывается целиком. Оптимистично обновляется только
 * перетаскивание: там задержка видна глазом, а здесь поле и так закрывается сразу.
 * Архив перечитывается вместе с доской: любая правка перекладывает элемент между ними.
 * Открытая панель гасится вся, корнем ключа, — тем же приёмом, что и в `useBoardEvents`.
 * Сроки на календарной сетке тоже: правка доски двигает и их.
 */
function useBoardChange<T = void>(boardId: string, request: (input: T) => Promise<unknown>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
      void client.invalidateQueries({ queryKey: archiveKey(boardId) })
      void client.invalidateQueries({ queryKey: cardsKey })
      void client.invalidateQueries({ queryKey: duesKey })
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

export const useDescribeCard = (boardId: string, cardId: string) =>
  useBoardChange(boardId, (description: string | null) =>
    sendJson('PATCH', `/api/cards/${cardId}`, { description }),
  )

export type DueDraft = { date: string; time: string | null } | null

export const useSetCardDue = (boardId: string, cardId: string) =>
  useBoardChange(boardId, (due: DueDraft) => sendJson('PATCH', `/api/cards/${cardId}`, { due }))

export const useSetCardDueDone = (boardId: string, cardId: string) =>
  useBoardChange(boardId, (dueDone: boolean) =>
    sendJson('PATCH', `/api/cards/${cardId}`, { dueDone }),
  )

const setArchived = (url: string, archived: boolean) => () => sendJson('PATCH', url, { archived })

export const useArchiveList = (boardId: string, listId: string) =>
  useBoardChange(boardId, setArchived(`/api/lists/${listId}`, true))

export const useRestoreList = (boardId: string, listId: string) =>
  useBoardChange(boardId, setArchived(`/api/lists/${listId}`, false))

export const useArchiveCard = (boardId: string, cardId: string) =>
  useBoardChange(boardId, setArchived(`/api/cards/${cardId}`, true))

export const useRestoreCard = (boardId: string, cardId: string) =>
  useBoardChange(boardId, setArchived(`/api/cards/${cardId}`, false))

export type MoveInput = MovePlan & { boardId: string; cardId: string }

/**
 * Единственная оптимистичная мутация: карточка встаёт на место мгновенно, запрос уходит
 * следом, ошибка возвращает доску как была. Ранг с клиента не уходит — только соседи.
 */
export function useMoveCard() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ cardId, listId, prevCardId, nextCardId }: MoveInput) =>
      sendJson('PATCH', `/api/cards/${cardId}`, { listId, prevCardId, nextCardId }),

    onMutate: async ({ boardId, cardId, ...plan }) => {
      // иначе ответ запроса, ушедшего до броска, перезапишет только что переложенную доску
      await client.cancelQueries({ queryKey: boardKey(boardId) })

      const previous = client.getQueryData<BoardView>(boardKey(boardId))
      if (previous) client.setQueryData(boardKey(boardId), applyMove(previous, cardId, plan))
      return { previous }
    },

    onError: (_error, { boardId }, context) => {
      if (context?.previous) client.setQueryData(boardKey(boardId), context.previous)
    },

    onSettled: (_data, _error, { boardId }) => {
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
    },
  })
}

export type ListMoveInput = ListMovePlan & { boardId: string; listId: string }

/** Перестановка списка. Оптимистично, как и карточка: ранг считает сервис. */
export function useMoveList() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ listId, prevListId, nextListId }: ListMoveInput) =>
      sendJson('PATCH', `/api/lists/${listId}`, { prevListId, nextListId }),

    onMutate: async ({ boardId, listId, ...plan }) => {
      await client.cancelQueries({ queryKey: boardKey(boardId) })

      const previous = client.getQueryData<BoardView>(boardKey(boardId))
      if (previous) client.setQueryData(boardKey(boardId), applyListMove(previous, listId, plan))
      return { previous }
    },

    onError: (_error, { boardId }, context) => {
      if (context?.previous) client.setQueryData(boardKey(boardId), context.previous)
    },

    onSettled: (_data, _error, { boardId }) => {
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
    },
  })
}

/**
 * Перенос карточки на другую доску. Перечитываются обе доски: карточка ушла с одной
 * и появилась на другой.
 */
export function useTransferCard(boardId: string, cardId: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ listId }: { listId: string; targetBoardId: string }) =>
      sendJson('POST', `/api/cards/${cardId}/transfer`, { listId }),

    onSuccess: (_data, { targetBoardId }) => {
      for (const id of new Set([boardId, targetBoardId])) {
        void client.invalidateQueries({ queryKey: boardKey(id) })
        void client.invalidateQueries({ queryKey: archiveKey(id) })
      }
    },
  })
}
