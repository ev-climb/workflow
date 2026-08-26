import type { BoardCard, BoardList, BoardWithLists } from '@/server/services/boards'

export type CardView = Omit<BoardCard, 'dueAt'> & { dueAt: string | null }
export type ListView = Omit<BoardList, 'cards'> & { cards: CardView[] }
export type BoardView = Omit<BoardWithLists, 'lists'> & { lists: ListView[] }

/**
 * Вид доски для клиента: после JSON даты становятся строками. Один и тот же перевод
 * и в ответе маршрута, и в первой отрисовке на сервере — иначе гидратация разойдётся
 * с тем, что придёт следующим запросом.
 */
export function toBoardView(board: BoardWithLists): BoardView {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) => ({ ...card, dueAt: card.dueAt?.toISOString() ?? null })),
    })),
  }
}
