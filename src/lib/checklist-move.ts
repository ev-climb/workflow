import type { ChecklistItemView, ChecklistView } from '@/server/services/checklists'

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

const indexIn = (items: ChecklistItemView[], itemId: string) =>
  items.findIndex((item) => item.id === itemId)

/** Соседи пункта после броска. `null` — пункт остался там же, где был: запрос не нужен. */
export function planItemMove(
  checklists: ChecklistView[],
  itemId: string,
  target: ItemDragData,
): ItemMovePlan | null {
  const from = checklists.find((checklist) => indexIn(checklist.items, itemId) >= 0)
  const to = checklists.find((checklist) => checklist.id === target.checklistId)
  if (!from || !to) return null

  const rest = to.items.filter((item) => item.id !== itemId)

  // в своём чек-листе цель считается по полному набору: пункт проезжает мимо соседа
  // сверху вниз и встаёт за ним, снизу вверх — перед ним, как в arrayMove
  const at =
    target.type === 'checklist'
      ? rest.length
      : from.id === to.id
        ? indexIn(from.items, target.item.id)
        : indexIn(rest, target.item.id)

  if (at < 0) return null

  const plan = {
    checklistId: to.id,
    prevItemId: rest[at - 1]?.id ?? null,
    nextItemId: rest[at]?.id ?? null,
  }

  const was = indexIn(from.items, itemId)
  const stayed =
    from.id === to.id &&
    plan.prevItemId === (from.items[was - 1]?.id ?? null) &&
    plan.nextItemId === (from.items[was + 1]?.id ?? null)

  return stayed ? null : plan
}

/** Та же раскладка, что получится на сервере, — для оптимистичного обновления. */
export function applyItemMove(
  checklists: ChecklistView[],
  itemId: string,
  plan: ItemMovePlan,
): ChecklistView[] {
  const moved = checklists.flatMap((checklist) => checklist.items).find((item) => item.id === itemId)
  if (!moved) return checklists

  return checklists.map((checklist) => {
    const rest = checklist.items.filter((item) => item.id !== itemId)
    if (checklist.id !== plan.checklistId) return { ...checklist, items: rest }

    const at = plan.prevItemId === null ? 0 : indexIn(rest, plan.prevItemId) + 1
    return { ...checklist, items: [...rest.slice(0, at), moved, ...rest.slice(at)] }
  })
}
