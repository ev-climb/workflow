import type { ChecklistItemView, ChecklistView } from '@/server/services/checklists'
import { applyReorder, type Group, planReorder } from './move'

/** Что таскают и на что кладут. Чек-лист — только цель: сами чек-листы не переставляются. */
export type ItemDragData =
  | { type: 'item'; checklistId: string; item: ChecklistItemView }
  | { type: 'checklist'; checklistId: string }

export const itemDragId = (kind: 'item' | 'checklist', id: string) => `${kind}:${id}`

/** Позиция описывается соседями: ранг считает сервис — инвариант 1. */
export type ItemMovePlan = {
  checklistId: string
  prevItemId: string | null
  nextItemId: string | null
}

const itemGroups = (checklists: ChecklistView[]): Group<ChecklistItemView>[] =>
  checklists.map((checklist) => ({ id: checklist.id, items: checklist.items }))

/** Соседи пункта после броска. `null` — пункт остался там же, где был: запрос не нужен. */
export function planItemMove(
  checklists: ChecklistView[],
  itemId: string,
  target: ItemDragData,
): ItemMovePlan | null {
  const plan = planReorder(itemGroups(checklists), itemId, {
    groupId: target.checklistId,
    itemId: target.type === 'item' ? target.item.id : null,
  })
  if (!plan) return null

  return { checklistId: plan.groupId, prevItemId: plan.prevId, nextItemId: plan.nextId }
}

/** Та же раскладка, что получится на сервере, — для оптимистичного обновления. */
export function applyItemMove(
  checklists: ChecklistView[],
  itemId: string,
  plan: ItemMovePlan,
): ChecklistView[] {
  const moved = applyReorder(itemGroups(checklists), itemId, {
    groupId: plan.checklistId,
    prevId: plan.prevItemId,
    nextId: plan.nextItemId,
  })

  return checklists.map((checklist, at) => ({ ...checklist, items: moved[at].items }))
}
