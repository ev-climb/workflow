'use client'

import { useState } from 'react'
import {
  moved,
  rangeTimes,
  resized,
  sameRange,
  selection,
  snapMinutes,
  type DragKind,
  type Range,
  type Target,
} from '@/lib/calendar-drag'
import { useMoveTimeBlock, useSetEventTimes } from '@/lib/calendar-mutations'
import type { CalendarEventView, TimeBlockView } from '@/lib/calendar-view'
import { cardHref, type OpenHandler } from './grid'

type Drag = {
  kind: DragKind
  /** Что тащат; у выделения цели нет. */
  target: Target | null
  base: Range
  range: Range
  /** Минута, за которую взялись: сдвиг блока считается от неё, а не от его начала. */
  grabbed: number
}

export type GrabHandler = (
  event: React.PointerEvent,
  kind: DragKind,
  base: Range,
  target: Target | null,
) => void

/** Минута сетки под курсором. Колонки одной высоты, поэтому годится любая из них. */
function minutesIn(column: HTMLElement, clientY: number): number {
  const box = column.getBoundingClientRect()
  return snapMinutes(clientY - box.top, box.height)
}

/** День колонки под курсором: в недельном виде блок переезжает вбок тем же движением. */
function dayUnder(clientX: number, clientY: number): string | null {
  const found = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-day]')
  return found?.dataset.day ?? null
}

export type GridDrag = {
  /** Отрезок под заготовкой: его тащат прямо сейчас или уже дописывают в Google. */
  held: { target: Target | null; range: Range } | null
  grab: GrabHandler
  advance: (event: React.PointerEvent) => void
  finish: () => void
  cancel: () => void
  error: Error | null
}

/**
 * Жест на сетке: выделение под новое событие, перенос блока и растягивание за край. Ведёт
 * его захват указателя на колонке, а не dnd-kit: тащат здесь не саму отрисованную вещь, а
 * отрезок времени, и рисуется он заготовкой.
 */
export function useGridDrag(input: {
  events: CalendarEventView[]
  blocks: TimeBlockView[]
  onSelect: (range: Range) => void
  onOpen: OpenHandler
}): GridDrag {
  const { events, blocks, onSelect, onOpen } = input
  const [drag, setDrag] = useState<Drag | null>(null)
  /**
   * Отрезок, записанный в Google, но ещё не приехавший обратно: пока идёт запрос, блок
   * держится на новом месте. Иначе событие прыгало бы назад на время похода в сеть.
   */
  const [pending, setPending] = useState<{ target: Target; range: Range } | null>(null)
  const setTimes = useSetEventTimes()
  const moveBlock = useMoveTimeBlock()

  const grab: GrabHandler = (event, kind, base, dragging) => {
    if (event.button !== 0) return
    const column = event.currentTarget.closest<HTMLElement>('[data-day]')
    if (!column) return

    event.preventDefault()
    column.setPointerCapture(event.pointerId)
    const grabbed = minutesIn(column, event.clientY)
    const range = kind === 'select' ? selection(base.day, grabbed, grabbed) : base
    setDrag({ kind, target: dragging, base, range, grabbed })
  }

  /**
   * Отрезок считается от точки, за которую взялись, а не от прошлого шага: движение, не
   * поспевшее за отрисовкой, ничего не сдвигает лишний раз.
   */
  function advance(event: React.PointerEvent) {
    const column = event.currentTarget as HTMLElement
    if (!drag || !column.hasPointerCapture(event.pointerId)) return

    const minutes = minutesIn(column, event.clientY)
    if (drag.kind === 'select') {
      setDrag({ ...drag, range: selection(drag.base.day, drag.grabbed, minutes) })
      return
    }
    if (drag.kind === 'move') {
      const day = dayUnder(event.clientX, event.clientY) ?? drag.range.day
      setDrag({ ...drag, range: moved(drag.base, day, minutes - drag.grabbed) })
      return
    }
    setDrag({ ...drag, range: resized(drag.base, drag.kind, minutes) })
  }

  function finish() {
    const current = drag
    setDrag(null)
    if (!current) return

    if (current.kind === 'select') {
      onSelect(current.range)
      return
    }
    const moving = current.target
    if (!moving) return

    // отпустили там же, где взяли: это щелчок, а не правка времени
    if (sameRange(current.range, current.base)) {
      if (moving.type === 'event') {
        const clicked = events.find((one) => one.id === moving.id)
        if (clicked) onOpen(clicked)
        return
      }
      const clicked = blocks.find((one) => one.id === moving.id)
      if (clicked) window.location.href = cardHref(clicked.cardId)
      return
    }

    setPending({ target: moving, range: current.range })
    const times = rangeTimes(current.range)
    const settle = { onSettled: () => setPending(null) }
    if (moving.type === 'event') {
      setTimes.mutate({ id: moving.id, times }, settle)
      return
    }
    moveBlock.mutate({ id: moving.id, startsAt: times.startsAt, endsAt: times.endsAt }, settle)
  }

  return {
    held: drag ?? pending,
    grab,
    advance,
    finish,
    cancel: () => setDrag(null),
    error: setTimes.error ?? moveBlock.error,
  }
}
