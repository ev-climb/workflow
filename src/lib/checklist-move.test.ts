import { describe, expect, it } from 'vitest'
import type { ChecklistItemView, ChecklistView } from '@/server/services/checklists'
import { applyItemMove, type ItemDragData, planItemMove } from './checklist-move'

const item = (id: string): ChecklistItemView => ({ id, title: id, done: false, rank: id })

const checklist = (id: string, items: string[]): ChecklistView => ({
  id,
  title: id,
  rank: id,
  items: items.map(item),
})

const ontoItem = (checklistId: string, itemId: string): ItemDragData => ({
  type: 'item',
  checklistId,
  item: item(itemId),
})

const ontoChecklist = (checklistId: string): ItemDragData => ({ type: 'checklist', checklistId })

const layout = (checklists: ChecklistView[]) =>
  Object.fromEntries(checklists.map((c) => [c.id, c.items.map((i) => i.id)]))

describe('planItemMove', () => {
  const two = [checklist('шаги', ['a', 'b']), checklist('проверки', ['x', 'y'])]

  it('бросок на пункт — соседи в его чек-листе', () => {
    expect(planItemMove(two, 'a', ontoItem('проверки', 'y'))).toEqual({
      checklistId: 'проверки',
      prevItemId: 'x',
      nextItemId: 'y',
    })
  })

  it('бросок на сам чек-лист — в его конец', () => {
    expect(planItemMove(two, 'a', ontoChecklist('проверки'))).toEqual({
      checklistId: 'проверки',
      prevItemId: 'y',
      nextItemId: null,
    })
  })

  it('бросок на прежнее место — запроса нет', () => {
    expect(planItemMove(two, 'a', ontoItem('шаги', 'a'))).toBeNull()
  })
})

describe('applyItemMove', () => {
  const two = [checklist('шаги', ['a', 'b', 'c']), checklist('проверки', ['x'])]

  it('раскладка совпадает с планом', () => {
    const plan = planItemMove(two, 'b', ontoItem('проверки', 'x'))!

    expect(layout(applyItemMove(two, 'b', plan))).toEqual({
      шаги: ['a', 'c'],
      проверки: ['b', 'x'],
    })
  })

  it('остальные поля чек-листа остаются на месте', () => {
    const plan = planItemMove(two, 'b', ontoItem('проверки', 'x'))!
    const [steps] = applyItemMove(two, 'b', plan)

    expect(steps).toMatchObject({ title: 'шаги', rank: 'шаги' })
  })
})
