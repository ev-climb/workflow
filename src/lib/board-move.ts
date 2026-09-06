import type { BoardView, CardView, ListView } from './board-view'
import { applyReorder, type Group, planReorder } from './move'

/**
 * Что таскают и на что кладут. Список — и то и другое: его переставляют мышью, и на него
 * же кладут карточку. Доска в данных названа явно: по ней узнаётся попытка перетащить
 * через границу между досками — её отменяем с подсказкой (ADR-005).
 */
export type DragData =
  | { type: 'card'; boardId: string; listId: string; card: CardView }
  | { type: 'list'; boardId: string; listId: string; list: ListView }

/**
 * Одна и та же доска может стоять в обоих слотах, а идентификаторы перетаскивания должны
 * быть уникальны на весь стол: слот в ключе разводит две копии одной карточки.
 */
export const dragId = (slot: string, kind: 'card' | 'list', id: string) => `${slot}:${kind}:${id}`

/** Позиция описывается соседями: ранг считает сервис — инвариант 2 и пункт 11 фазы. */
export type MovePlan = { listId: string; prevCardId: string | null; nextCardId: string | null }

const cardGroups = (board: BoardView): Group<CardView>[] =>
  board.lists.map((list) => ({ id: list.id, items: list.cards }))

/** Списки лежат в одном наборе — самой доске: перестановке нужен её единственный ключ. */
const BOARD = 'board'

const listGroups = (board: BoardView): Group<ListView>[] => [{ id: BOARD, items: board.lists }]

/**
 * Соседи карточки после броска. `null` — карточка осталась там же, где была:
 * запрос не нужен.
 */
export function planMove(board: BoardView, cardId: string, target: DragData): MovePlan | null {
  const plan = planReorder(cardGroups(board), cardId, {
    groupId: target.listId,
    itemId: target.type === 'card' ? target.card.id : null,
  })
  if (!plan) return null

  return { listId: plan.groupId, prevCardId: plan.prevId, nextCardId: plan.nextId }
}

/** Та же раскладка, что получится на сервере, — для оптимистичного обновления. */
export function applyMove(board: BoardView, cardId: string, plan: MovePlan): BoardView {
  const moved = applyReorder(cardGroups(board), cardId, {
    groupId: plan.listId,
    prevId: plan.prevCardId,
    nextId: plan.nextCardId,
  })

  return {
    ...board,
    lists: board.lists.map((list, at) => ({ ...list, cards: moved[at].items })),
  }
}

/** Позиция списка описывается соседями по доске: ранг считает сервис — инвариант 1. */
export type ListMovePlan = { prevListId: string | null; nextListId: string | null }

/**
 * Соседи списка после броска. Цель считается по полному набору списков: список проезжает
 * мимо соседа слева направо и встаёт за ним, справа налево — перед ним, как в arrayMove.
 * `null` — список остался там же, где был: запрос не нужен.
 */
export function planListMove(
  board: BoardView,
  listId: string,
  targetListId: string,
): ListMovePlan | null {
  const plan = planReorder(listGroups(board), listId, { groupId: BOARD, itemId: targetListId })
  if (!plan) return null

  return { prevListId: plan.prevId, nextListId: plan.nextId }
}

/** Та же раскладка, что получится на сервере, — для оптимистичного обновления. */
export function applyListMove(board: BoardView, listId: string, plan: ListMovePlan): BoardView {
  const [moved] = applyReorder(listGroups(board), listId, {
    groupId: BOARD,
    prevId: plan.prevListId,
    nextId: plan.nextListId,
  })

  return { ...board, lists: moved.items }
}
