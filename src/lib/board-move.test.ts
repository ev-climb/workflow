import { describe, expect, it } from 'vitest'
import { applyListMove, applyMove, type DragData, planListMove, planMove } from './board-move'
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
  const two = board(list('todo', ['a', 'b']), list('done', ['x', 'y']))

  it('бросок на карточку — соседи в её списке', () => {
    expect(planMove(two, 'a', ontoCard('done', 'y'))).toEqual({
      listId: 'done',
      prevCardId: 'x',
      nextCardId: 'y',
    })
  })

  it('бросок на сам список — в его конец', () => {
    expect(planMove(two, 'a', ontoList('done'))).toEqual({
      listId: 'done',
      prevCardId: 'y',
      nextCardId: null,
    })
  })

  it('бросок на прежнее место — запроса нет', () => {
    expect(planMove(two, 'a', ontoCard('todo', 'a'))).toBeNull()
  })
})

describe('applyMove', () => {
  const two = board(list('todo', ['a', 'b', 'c']), list('done', ['x', 'y']))

  it('кладёт карточку между теми соседями, что ушли на сервер', () => {
    const plan = planMove(two, 'a', ontoCard('done', 'y'))!

    expect(layout(applyMove(two, 'a', plan))).toEqual({ todo: ['b', 'c'], done: ['x', 'a', 'y'] })
  })

  it('остальные поля списка остаются на месте', () => {
    const plan = planMove(two, 'a', ontoCard('done', 'y'))!
    const [todo] = applyMove(two, 'a', plan).lists

    expect(todo).toMatchObject({ title: 'todo', rank: 'todo', wipLimit: null, highlighted: false })
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

  it('бросок на прежнее место — запроса нет', () => {
    expect(planListMove(four, 'b', 'b')).toBeNull()
  })
})

describe('applyListMove', () => {
  const three = board(list('a', ['x']), list('b', []), list('c', []))

  const order = (view: BoardView) => view.lists.map((l) => l.id)

  it('переставляет список между теми соседями, что ушли на сервер', () => {
    const plan = planListMove(three, 'a', 'c')!

    expect(order(applyListMove(three, 'a', plan))).toEqual(['b', 'c', 'a'])
  })

  it('карточки переезжают вместе со списком', () => {
    const plan = planListMove(three, 'a', 'b')!

    expect(applyListMove(three, 'a', plan).lists[1].cards.map((c) => c.id)).toEqual(['x'])
  })
})
