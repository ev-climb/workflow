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
 * Полосы над сеткой размечены теми же долями ширины, что и сама сетка, поэтому день для них
 * берётся отсюда же.
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
