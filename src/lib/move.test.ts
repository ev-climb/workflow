import { describe, expect, it } from 'vitest'
import { applyReorder, type Group, planReorder } from './move'

const group = (id: string, items: string[]): Group<{ id: string }> => ({
  id,
  items: items.map((item) => ({ id: item })),
})

const layout = (groups: Group<{ id: string }>[]) =>
  Object.fromEntries(groups.map((g) => [g.id, g.items.map((item) => item.id)]))

describe('planReorder', () => {
  const single = [group('todo', ['a', 'b', 'c', 'd'])]
  const two = [group('todo', ['a', 'b']), group('done', ['x', 'y'])]

  it('вниз по набору — элемент встаёт за соседа', () => {
    expect(planReorder(single, 'a', { groupId: 'todo', itemId: 'c' })).toEqual({
      groupId: 'todo',
      prevId: 'c',
      nextId: 'd',
    })
  })

  it('вверх по набору — перед соседом', () => {
    expect(planReorder(single, 'd', { groupId: 'todo', itemId: 'b' })).toEqual({
      groupId: 'todo',
      prevId: 'a',
      nextId: 'b',
    })
  })

  it('в чужой набор — перед тем элементом, на который бросили', () => {
    expect(planReorder(two, 'a', { groupId: 'done', itemId: 'y' })).toEqual({
      groupId: 'done',
      prevId: 'x',
      nextId: 'y',
    })
  })

  it('на свободное место — в конец набора', () => {
    expect(planReorder(two, 'a', { groupId: 'done', itemId: null })).toEqual({
      groupId: 'done',
      prevId: 'y',
      nextId: null,
    })
  })

  it('на свободное место своего набора — в конец, мимо себя', () => {
    expect(planReorder(single, 'a', { groupId: 'todo', itemId: null })).toEqual({
      groupId: 'todo',
      prevId: 'd',
      nextId: null,
    })
  })

  it('в пустой набор — без соседей', () => {
    const empty = [group('todo', ['a']), group('done', [])]

    expect(planReorder(empty, 'a', { groupId: 'done', itemId: null })).toEqual({
      groupId: 'done',
      prevId: null,
      nextId: null,
    })
  })

  it('бросок на прежнее место — запроса нет', () => {
    expect(planReorder(single, 'a', { groupId: 'todo', itemId: 'a' })).toBeNull()
    expect(planReorder(single, 'b', { groupId: 'todo', itemId: 'b' })).toBeNull()
  })

  it('элемента, набора или цели нет — запроса нет', () => {
    expect(planReorder(single, 'ghost', { groupId: 'todo', itemId: 'a' })).toBeNull()
    expect(planReorder(single, 'a', { groupId: 'ghost', itemId: null })).toBeNull()
    expect(planReorder(single, 'a', { groupId: 'todo', itemId: 'ghost' })).toBeNull()
  })
})

describe('applyReorder', () => {
  const two = [group('todo', ['a', 'b', 'c']), group('done', ['x', 'y'])]

  it('кладёт элемент между теми соседями, что ушли на сервер', () => {
    const plan = planReorder(two, 'a', { groupId: 'done', itemId: 'y' })!

    expect(layout(applyReorder(two, 'a', plan))).toEqual({ todo: ['b', 'c'], done: ['x', 'a', 'y'] })
  })

  it('без соседа слева — в начало набора', () => {
    const plan = planReorder(two, 'c', { groupId: 'done', itemId: 'x' })!

    expect(layout(applyReorder(two, 'c', plan))).toEqual({ todo: ['a', 'b'], done: ['c', 'x', 'y'] })
  })

  it('перестановка внутри набора', () => {
    const plan = planReorder(two, 'a', { groupId: 'todo', itemId: 'c' })!

    expect(layout(applyReorder(two, 'a', plan))).toEqual({ todo: ['b', 'c', 'a'], done: ['x', 'y'] })
  })

  it('неизвестный элемент ничего не двигает', () => {
    const plan = { groupId: 'todo', prevId: null, nextId: null }

    expect(layout(applyReorder(two, 'ghost', plan))).toEqual(layout(two))
  })
})
