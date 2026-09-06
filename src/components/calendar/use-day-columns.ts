'use client'

import { useRef } from 'react'

export type DayColumns = {
  /** `ref` колонки дня: без её узла день по месту курсора не найти. */
  register: (day: string) => (node: HTMLElement | null) => void
  columnAt: (clientX: number) => { day: string; box: DOMRect } | null
}

/**
 * Колонка дня по месту курсора. День берётся перебором колонок, а не у dnd-kit: цель у
 * сетки одна на все колонки, а колонок то одна, то семь. Слева от колонок лежит рейка со
 * временем, и курсор над ней попадает в первый день, а не в пустоту: мёртвой полосы внутри
 * цели быть не должно.
 *
 * Полосы над сеткой лежат в своих контейнерах: доли ширины у них те же, а сама ширина
 * другая — сетка прокручивается всегда, и её колонки уже на полосу прокрутки. День для
 * полос берёт `dayAtRow`.
 */
export function useDayColumns(days: string[]): DayColumns {
  const nodes = useRef(new Map<string, HTMLElement>())

  return {
    register: (day) => (node) => {
      if (node) nodes.current.set(day, node)
      else nodes.current.delete(day)
    },
    columnAt: (clientX) => {
      const boxes = days
        .map((day) => ({ day, box: nodes.current.get(day)?.getBoundingClientRect() }))
        .filter((one): one is { day: string; box: DOMRect } => one.box !== undefined)
      if (boxes.length === 0) return null

      return boxes.find(({ box }) => clientX < box.right) ?? boxes[boxes.length - 1]
    },
  }
}

/**
 * День по доле ширины ряда полос: колонки ряда равны между собой, и узел под курсором
 * искать не в чем — в ряду лежат только сами полосы, а не колонки. Слева от ряда рейка со
 * временем, курсор над ней попадает в первый день, как и на сетке.
 */
export function dayAtRow(days: string[], row: Element, clientX: number): string | null {
  const box = row.getBoundingClientRect()
  if (days.length === 0 || box.width === 0) return null

  const index = Math.floor(((clientX - box.left) / box.width) * days.length)
  return days[Math.min(Math.max(index, 0), days.length - 1)] ?? null
}
