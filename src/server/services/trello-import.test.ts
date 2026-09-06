import { describe, expect, it } from 'vitest'
import { getBoard } from './boards.ts'
import { importTrelloBoard } from './trello-import.ts'

function exportWith(labels: { id: string; name: string; color: string | null }[]) {
  return {
    id: 'b1',
    name: 'Доска из Trello',
    lists: [{ id: 'l1', name: 'Бэклог', pos: 1 }],
    cards: [
      {
        id: 'c1',
        name: 'карточка',
        idList: 'l1',
        idLabels: labels.map((l) => l.id),
        pos: 1,
      },
    ],
    labels,
  }
}

describe('импорт меток из Trello', () => {
  it('оттенок цвета сводится к основному', async () => {
    const summary = await importTrelloBoard(
      exportWith([{ id: 'a', name: 'срочно', color: 'green_dark' }]),
    )

    const board = await getBoard(summary.boardId)
    expect(board.labels).toMatchObject([{ name: 'срочно', color: 'green' }])
  })

  it('оттенки одного цвета с одним названием сливаются в одну метку', async () => {
    const summary = await importTrelloBoard(
      exportWith([
        { id: 'a', name: 'срочно', color: 'green_dark' },
        { id: 'b', name: 'срочно', color: 'green' },
        { id: 'c', name: 'срочно', color: 'sky_light' },
      ]),
    )

    expect(summary).toMatchObject({ labels: 2, cardLabels: 2, skippedLabels: 0 })
    const board = await getBoard(summary.boardId)
    expect(board.labels.map((l) => l.color).sort()).toEqual(['green', 'sky'])
    expect(board.lists[0].cards[0].labels).toHaveLength(2)
  })

  it('цвет вне набора отбрасывается вместе с меткой', async () => {
    const summary = await importTrelloBoard(
      exportWith([
        { id: 'a', name: 'непонятно', color: 'chartreuse' },
        { id: 'b', name: 'без цвета', color: null },
        { id: 'c', name: 'годная', color: 'red' },
      ]),
    )

    expect(summary).toMatchObject({ labels: 1, cardLabels: 1, skippedLabels: 2 })
    const board = await getBoard(summary.boardId)
    expect(board.labels).toMatchObject([{ name: 'годная', color: 'red' }])
  })
})
