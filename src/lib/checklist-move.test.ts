import { describe, expect, it } from 'vitest'
import type { ChecklistItemView, ChecklistView } from '@/server/services/checklists'
import { applyItemMove, planItemMove, type ItemDragData } from './checklist-move'

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
  const single = [checklist('шаги', ['a', 'b', 'c', 'd'])]

  it('вниз по чек-листу — пункт встаёт за соседа', () => {
    expect(planItemMove(single, 'a', ontoItem('шаги', 'c'))).toEqual({
      checklistId: 'шаги',
      prevItemId: 'c',
      nextItemId: 'd',
    })
  })

  it('вверх по чек-листу — пункт встаёт перед соседом', () => {
    expect(planItemMove(single, 'd', ontoItem('шаги', 'b'))).toEqual({
      checklistId: 'шаги',
      prevItemId: 'a',
      nextItemId: 'b',
    })
  })

  it('на прежнее место — запроса нет', () => {
    expect(planItemMove(single, 'b', ontoItem('шаги', 'b'))).toBeNull()
  })

  it('в другой чек-лист — соседи считаются в нём', () => {
    const two = [checklist('шаги', ['a', 'b']), checklist('проверки', ['x', 'y'])]

    expect(planItemMove(two, 'a', ontoItem('проверки', 'y'))).toEqual({
      checklistId: 'проверки',
      prevItemId: 'x',
      nextItemId: 'y',
    })
  })

  it('на пустой чек-лист — пункт становится единственным', () => {
    const two = [checklist('шаги', ['a']), checklist('проверки', [])]

    expect(planItemMove(two, 'a', ontoChecklist('проверки'))).toEqual({
      checklistId: 'проверки',
      prevItemId: null,
      nextItemId: null,
    })
  })

  it('на сам чек-лист — пункт уезжает в конец', () => {
    expect(planItemMove(single, 'a', ontoChecklist('шаги'))).toEqual({
      checklistId: 'шаги',
      prevItemId: 'd',
      nextItemId: null,
    })
  })

  it('неизвестный пункт или чужой чек-лист — запроса нет', () => {
    expect(planItemMove(single, 'нет', ontoItem('шаги', 'a'))).toBeNull()
    expect(planItemMove(single, 'a', ontoChecklist('чужой'))).toBeNull()
  })
})

describe('applyItemMove', () => {
  const two = [checklist('шаги', ['a', 'b', 'c']), checklist('проверки', ['x'])]

  it('внутри чек-листа раскладка совпадает с планом', () => {
    const plan = planItemMove(two, 'c', ontoItem('шаги', 'a'))
    expect(plan).not.toBeNull()

    expect(layout(applyItemMove(two, 'c', plan!))).toEqual({
      шаги: ['c', 'a', 'b'],
      проверки: ['x'],
    })
  })

  it('между чек-листами пункт уходит из прежнего', () => {
    const plan = planItemMove(two, 'b', ontoItem('проверки', 'x'))
    expect(plan).not.toBeNull()

    expect(layout(applyItemMove(two, 'b', plan!))).toEqual({
      шаги: ['a', 'c'],
      проверки: ['b', 'x'],
    })
  })

  it('неизвестный пункт ничего не двигает', () => {
    const plan = { checklistId: 'шаги', prevItemId: null, nextItemId: null }
    expect(layout(applyItemMove(two, 'нет', plan))).toEqual(layout(two))
  })
})
