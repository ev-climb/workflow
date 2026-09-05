import { describe, expect, it } from 'vitest'
import {
  applyListMove,
  applyMove,
  planListMove,
  planMove,
  type DragData,
} from './board-move'
import type { BoardView, CardView, ListView } from './board-view'

const card = (id: string): CardView => ({
  id,
  title: id,
  rank: id,
  dueAt: null,
  dueHasTime: true,
  dueDone: false,
  hasDescription: false,
  checklistDone: 0,
  checklistTotal: 0,
  labels: [],
})

const list = (id: string, cards: string[]): ListView => ({
  id,
  title: id,
  rank: id,
  wipLimit: null,
  highlighted: false,
  cards: cards.map(card),
})

const board = (...lists: ListView[]): BoardView => ({
  id: 'board',
  title: 'board',
  rank: 'a0',
  labels: [],
  lists,
})

const ontoCard = (listId: string, cardId: string): DragData => ({
  type: 'card',
  boardId: 'board',
  listId,
  card: card(cardId),
})

const ontoList = (listId: string): DragData => ({
  type: 'list',
  boardId: 'board',
  listId,
  list: list(listId, []),
})

const layout = (view: BoardView) =>
  Object.fromEntries(view.lists.map((l) => [l.id, l.cards.map((c) => c.id)]))

describe('planMove', () => {
  const single = board(list('todo', ['a', 'b', 'c', 'd']))

  it('вниз по списку — карточка встаёт за соседа', () => {
    expect(planMove(single, 'a', ontoCard('todo', 'c'))).toEqual({
      listId: 'todo',
      prevCardId: 'c',
      nextCardId: 'd',
    })
  })

  it('вверх по списку — перед соседом', () => {
    expect(planMove(single, 'd', ontoCard('todo', 'b'))).toEqual({
      listId: 'todo',
      prevCardId: 'a',
      nextCardId: 'b',
    })
  })

  it('в чужой список — перед той карточкой, на которую бросили', () => {
    const two = board(list('todo', ['a', 'b']), list('done', ['x', 'y']))

    expect(planMove(two, 'a', ontoCard('done', 'y'))).toEqual({
      listId: 'done',
      prevCardId: 'x',
      nextCardId: 'y',
    })
  })

  it('на свободное место списка — в конец', () => {
    const two = board(list('todo', ['a', 'b']), list('done', ['x']))

    expect(planMove(two, 'a', ontoList('done'))).toEqual({
      listId: 'done',
      prevCardId: 'x',
      nextCardId: null,
    })
  })

  it('в пустой список — без соседей', () => {
    const two = board(list('todo', ['a']), list('done', []))

    expect(planMove(two, 'a', ontoList('done'))).toEqual({
      listId: 'done',
      prevCardId: null,
      nextCardId: null,
    })
  })

  it('бросок на прежнее место — запроса нет', () => {
    expect(planMove(single, 'a', ontoCard('todo', 'a'))).toBeNull()
    expect(planMove(single, 'b', ontoCard('todo', 'b'))).toBeNull()
  })

  it('карточки или списка нет — запроса нет', () => {
    expect(planMove(single, 'ghost', ontoCard('todo', 'a'))).toBeNull()
    expect(planMove(single, 'a', ontoList('ghost'))).toBeNull()
  })
})

describe('applyMove', () => {
  const two = board(list('todo', ['a', 'b', 'c']), list('done', ['x', 'y']))

  it('кладёт карточку между теми соседями, что ушли на сервер', () => {
    const plan = planMove(two, 'a', ontoCard('done', 'y'))!

    expect(layout(applyMove(two, 'a', plan))).toEqual({ todo: ['b', 'c'], done: ['x', 'a', 'y'] })
  })

  it('без соседа слева — в начало списка', () => {
    const plan = planMove(two, 'c', ontoCard('done', 'x'))!

    expect(layout(applyMove(two, 'c', plan))).toEqual({ todo: ['a', 'b'], done: ['c', 'x', 'y'] })
  })

  it('перестановка внутри списка', () => {
    const plan = planMove(two, 'a', ontoCard('todo', 'c'))!

    expect(layout(applyMove(two, 'a', plan))).toEqual({ todo: ['b', 'c', 'a'], done: ['x', 'y'] })
  })
})

describe('planListMove', () => {
  const four = board(list('a', []), list('b', []), list('c', []), list('d', []))

  it('слева направо — список встаёт за тем, на который бросили', () => {
    expect(planListMove(four, 'a', 'c')).toEqual({ prevListId: 'c', nextListId: 'd' })
  })

  it('справа налево — перед тем, на который бросили', () => {
    expect(planListMove(four, 'd', 'b')).toEqual({ prevListId: 'a', nextListId: 'b' })
  })

  it('в самое начало — без соседа слева', () => {
    expect(planListMove(four, 'c', 'a')).toEqual({ prevListId: null, nextListId: 'a' })
  })

  it('бросок на прежнее место — запроса нет', () => {
    expect(planListMove(four, 'b', 'b')).toBeNull()
    expect(planListMove(four, 'a', 'a')).toBeNull()
  })

  it('списка нет — запроса нет', () => {
    expect(planListMove(four, 'ghost', 'a')).toBeNull()
    expect(planListMove(four, 'a', 'ghost')).toBeNull()
  })
})

describe('applyListMove', () => {
  const three = board(list('a', ['x']), list('b', []), list('c', []))

  const order = (view: BoardView) => view.lists.map((l) => l.id)

  it('переставляет список между теми соседями, что ушли на сервер', () => {
    const plan = planListMove(three, 'a', 'c')!

    expect(order(applyListMove(three, 'a', plan))).toEqual(['b', 'c', 'a'])
  })

  it('без соседа слева — в начало доски', () => {
    const plan = planListMove(three, 'c', 'a')!

    expect(order(applyListMove(three, 'c', plan))).toEqual(['c', 'a', 'b'])
  })

  it('карточки переезжают вместе со списком', () => {
    const plan = planListMove(three, 'a', 'b')!

    expect(applyListMove(three, 'a', plan).lists[1].cards.map((c) => c.id)).toEqual(['x'])
  })
})
