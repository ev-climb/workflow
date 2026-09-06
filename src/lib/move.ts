/**
 * Перестановка по соседям: один алгоритм на карточки в списках, списки на доске и пункты
 * в чек-листах. Доменные модули дают ему свои наборы в общей форме и переводят ответ в
 * свои имена полей.
 */

export type Movable = { id: string }

/** Набор, внутри которого элементы упорядочены: список карточек, чек-лист, сама доска. */
export type Group<T extends Movable> = { id: string; items: T[] }

/** Куда бросили: набор и элемент под курсором. `itemId: null` — на свободное место. */
export type MoveTarget = { groupId: string; itemId: string | null }

/** Позиция описывается соседями: ранг считает сервис — инвариант 1. */
export type Reorder = { groupId: string; prevId: string | null; nextId: string | null }

const indexIn = <T extends Movable>(items: T[], id: string) =>
  items.findIndex((item) => item.id === id)

/** Соседи элемента после броска. `null` — элемент остался там же, где был: запрос не нужен. */
export function planReorder<T extends Movable>(
  groups: Group<T>[],
  itemId: string,
  target: MoveTarget,
): Reorder | null {
  const from = groups.find((group) => indexIn(group.items, itemId) >= 0)
  const to = groups.find((group) => group.id === target.groupId)
  if (!from || !to) return null

  const rest = to.items.filter((item) => item.id !== itemId)

  // в своём наборе цель считается по полному набору: элемент проезжает мимо соседа
  // сверху вниз и встаёт за ним, снизу вверх — перед ним, как в arrayMove
  const at =
    target.itemId === null
      ? rest.length
      : from.id === to.id
        ? indexIn(from.items, target.itemId)
        : indexIn(rest, target.itemId)

  if (at < 0) return null

  const plan = {
    groupId: to.id,
    prevId: rest[at - 1]?.id ?? null,
    nextId: rest[at]?.id ?? null,
  }

  const was = indexIn(from.items, itemId)
  const stayed =
    from.id === to.id &&
    plan.prevId === (from.items[was - 1]?.id ?? null) &&
    plan.nextId === (from.items[was + 1]?.id ?? null)

  return stayed ? null : plan
}

/** Та же раскладка, что получится на сервере, — для оптимистичного обновления. */
export function applyReorder<T extends Movable>(
  groups: Group<T>[],
  itemId: string,
  plan: Reorder,
): Group<T>[] {
  const moved = groups.flatMap((group) => group.items).find((item) => item.id === itemId)
  if (!moved) return groups

  return groups.map((group) => {
    const rest = group.items.filter((item) => item.id !== itemId)
    if (group.id !== plan.groupId) return { ...group, items: rest }

    const at = plan.prevId === null ? 0 : indexIn(rest, plan.prevId) + 1
    return { ...group, items: [...rest.slice(0, at), moved, ...rest.slice(at)] }
  })
}
