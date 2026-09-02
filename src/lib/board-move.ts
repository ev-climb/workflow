import type { BoardView, CardView, ListView } from './board-view'

/**
 * Что таскают и на что кладут. Список — и то и другое: его переставляют мышью, и на него
 * же кладут карточку. Доска в данных названа явно: по ней узнаётся попытка перетащить
 * через границу между досками — её отменяем с подсказкой (ADR-005).
 */
export type DragData =
  | { type: 'card'; boardId: string; listId: string; card: CardView }
  | { type: 'list'; boardId: string; listId: string; list: ListView }

export type CardDrag = Extract<DragData, { type: 'card' }>

/** Карточка под курсором: на календарь бросают только её — списку срок ставить некуда. */
export function draggedCard(data: unknown): CardDrag | null {
  const drag = data as DragData | undefined
  return drag?.type === 'card' ? drag : null
}

/**
 * Одна и та же доска может стоять в обоих слотах, а идентификаторы перетаскивания должны
 * быть уникальны на весь стол: слот в ключе разводит две копии одной карточки.
 */
export const dragId = (slot: string, kind: 'card' | 'list', id: string) => `${slot}:${kind}:${id}`

/** Позиция описывается соседями: ранг считает сервис — инвариант 2 и пункт 11 фазы. */
export type MovePlan = { listId: string; prevCardId: string | null; nextCardId: string | null }

const indexIn = (cards: CardView[], cardId: string) => cards.findIndex((card) => card.id === cardId)

/**
 * Соседи карточки после броска. `null` — карточка осталась там же, где была:
 * запрос не нужен.
 */
export function planMove(board: BoardView, cardId: string, target: DragData): MovePlan | null {
  const from = board.lists.find((list) => indexIn(list.cards, cardId) >= 0)
  const to = board.lists.find((list) => list.id === target.listId)
  if (!from || !to) return null

  const rest = to.cards.filter((card) => card.id !== cardId)

  // в своём списке цель считается по полному списку: карточка проезжает мимо соседа
  // сверху вниз и встаёт за ним, снизу вверх — перед ним, как в arrayMove
  const at =
    target.type === 'list'
      ? rest.length
      : from.id === to.id
        ? indexIn(from.cards, target.card.id)
        : indexIn(rest, target.card.id)

  if (at < 0) return null

  const plan = {
    listId: to.id,
    prevCardId: rest[at - 1]?.id ?? null,
    nextCardId: rest[at]?.id ?? null,
  }

  const was = indexIn(from.cards, cardId)
  const stayed =
    from.id === to.id &&
    plan.prevCardId === (from.cards[was - 1]?.id ?? null) &&
    plan.nextCardId === (from.cards[was + 1]?.id ?? null)

  return stayed ? null : plan
}

/** Та же раскладка, что получится на сервере, — для оптимистичного обновления. */
export function applyMove(board: BoardView, cardId: string, plan: MovePlan): BoardView {
  const moved = board.lists.flatMap((list) => list.cards).find((card) => card.id === cardId)
  if (!moved) return board

  return {
    ...board,
    lists: board.lists.map((list) => {
      const rest = list.cards.filter((card) => card.id !== cardId)
      if (list.id !== plan.listId) return { ...list, cards: rest }

      const at = plan.prevCardId === null ? 0 : indexIn(rest, plan.prevCardId) + 1
      return { ...list, cards: [...rest.slice(0, at), moved, ...rest.slice(at)] }
    }),
  }
}

/** Позиция списка описывается соседями по доске: ранг считает сервис — инвариант 1. */
export type ListMovePlan = { prevListId: string | null; nextListId: string | null }

const listIndex = (lists: ListView[], listId: string) => lists.findIndex((l) => l.id === listId)

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
  const was = listIndex(board.lists, listId)
  const at = listIndex(board.lists, targetListId)
  if (was < 0 || at < 0) return null

  const rest = board.lists.filter((list) => list.id !== listId)
  const plan = {
    prevListId: rest[at - 1]?.id ?? null,
    nextListId: rest[at]?.id ?? null,
  }

  const stayed =
    plan.prevListId === (board.lists[was - 1]?.id ?? null) &&
    plan.nextListId === (board.lists[was + 1]?.id ?? null)

  return stayed ? null : plan
}

/** Та же раскладка, что получится на сервере, — для оптимистичного обновления. */
export function applyListMove(board: BoardView, listId: string, plan: ListMovePlan): BoardView {
  const moved = board.lists.find((list) => list.id === listId)
  if (!moved) return board

  const rest = board.lists.filter((list) => list.id !== listId)
  const at = plan.prevListId === null ? 0 : listIndex(rest, plan.prevListId) + 1

  return { ...board, lists: [...rest.slice(0, at), moved, ...rest.slice(at)] }
}
