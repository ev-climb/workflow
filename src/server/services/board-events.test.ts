import { describe, expect, it } from 'vitest'
import { publishBoardChanged, subscribeBoardChanged } from './board-events.ts'
import { archiveList, createBoard, createList, renameList, restoreList } from './boards.ts'
import { archiveCard, createCard, moveCard, renameCard, restoreCard } from './cards.ts'

/** Что вкладки увидели, пока шли мутации. */
async function events(work: () => Promise<void>): Promise<string[]> {
  const seen: string[] = []
  const off = subscribeBoardChanged(({ boardId }) => seen.push(boardId))
  try {
    await work()
  } finally {
    off()
  }
  return seen
}

describe('шина событий доски', () => {
  it('доставляет событие подписчику', () => {
    const seen: string[] = []
    const off = subscribeBoardChanged(({ boardId }) => seen.push(boardId))

    publishBoardChanged('доска-1')
    off()

    expect(seen).toEqual(['доска-1'])
  })

  it('после отписки событий не приходит', () => {
    const seen: string[] = []
    const off = subscribeBoardChanged(({ boardId }) => seen.push(boardId))

    off()
    publishBoardChanged('доска-1')

    expect(seen).toEqual([])
  })

  it('доставляет всем подписчикам сразу', () => {
    const seen: string[] = []
    const offs = [
      subscribeBoardChanged(() => seen.push('первый')),
      subscribeBoardChanged(() => seen.push('второй')),
    ]

    publishBoardChanged('доска-1')
    for (const off of offs) off()

    expect(seen).toEqual(['первый', 'второй'])
  })

  it('сорвавшийся слушатель не мешает соседу и не бросается в publish', () => {
    const seen: string[] = []
    const offs = [
      subscribeBoardChanged(() => {
        throw new Error('поток закрыт')
      }),
      subscribeBoardChanged(() => seen.push('сосед')),
    ]

    expect(() => publishBoardChanged('доска-1')).not.toThrow()
    for (const off of offs) off()

    expect(seen).toEqual(['сосед'])
  })
})

describe('сервисы рассылают события', () => {
  it('правка списка и карточки помечает их доску', async () => {
    const board = await createBoard({ title: 'Доска' })
    const list = await createList({ boardId: board.id, title: 'Список' })
    const card = await createCard({ listId: list.id, title: 'Карточка' })

    const seen = await events(async () => {
      await renameList(list.id, 'Другой список')
      await renameCard(card.id, 'Другая карточка')
      await moveCard({ cardId: card.id, listId: list.id })
      await archiveCard(card.id)
      await restoreCard(card.id)
      await archiveList(list.id)
      await restoreList(list.id)
    })

    expect(seen).toEqual(Array<string>(7).fill(board.id))
  })

  it('заведение списка и карточки тоже слышно', async () => {
    const board = await createBoard({ title: 'Доска' })

    const seen = await events(async () => {
      const list = await createList({ boardId: board.id, title: 'Список' })
      await createCard({ listId: list.id, title: 'Карточка' })
    })

    expect(seen).toEqual([board.id, board.id])
  })
})
