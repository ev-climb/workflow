'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  moved,
  rangeSlot,
  rangeTimes,
  resized,
  sameRange,
  selection,
  snapMinutes,
  targetKey,
  type DragKind,
  type Held,
  type Range,
  type Target,
} from '@/lib/calendar-drag'
import { useMoveTimeBlock, useSetEventTimes, useSetTaskSlot } from '@/lib/calendar-mutations'
import type { CalendarEventView, TimeBlockView } from '@/lib/calendar-view'
import type { CalendarTask } from '@/server/services/google-tasks'
import { cardHref, type OpenHandler, type TaskOpenHandler } from './grid'

type Drag = {
  kind: DragKind
  /** Что тащат; у выделения цели нет. */
  target: Target | null
  base: Range
  range: Range
  /** Минута, за которую взялись: сдвиг блока считается от неё, а не от его начала. */
  grabbed: number
}

/** Удержание в записи: метка отличает его от нового удержания той же цели. */
type Pending = Held & { stamp: number }

/** Столько палец держат на сетке, прежде чем жест станет выделением или переносом. */
const HOLD_MS = 300

/** Сдвинувшись дальше, не дождавшись удержания, палец уже листает сетку. */
const HOLD_SLOP_PX = 8

/** Палец на сетке, который ещё не подержали: жест наготове, но не начат. */
type Hold = {
  timer: ReturnType<typeof setTimeout>
  pointerId: number
  x: number
  y: number
  start: Drag
}

export type GrabHandler = (
  event: React.PointerEvent,
  kind: DragKind,
  base: Range,
  target: Target | null,
) => void

/** Ключ выделения: цели у него нет, а место среди удержаний нужно. */
const SELECTION = 'selection'

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
  /** Отрезки под заготовками: один тащат прямо сейчас, остальные дописываются в Google. */
  held: Held[]
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
  tasks: CalendarTask[]
  onSelect: (range: Range) => void
  onOpen: OpenHandler
  onOpenTask: TaskOpenHandler
}): GridDrag {
  const { events, blocks, tasks, onSelect, onOpen, onOpenTask } = input
  const [drag, setDrag] = useState<Drag | null>(null)
  /**
   * Отрезки, записанные в Google, но ещё не приехавшие обратно: пока идёт запрос, блок
   * держится на новом месте. Иначе событие прыгало бы назад на время похода в сеть.
   * По записи на цель, а не одна на всю сетку: соседний перенос гасил бы чужое удержание.
   */
  const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(new Map())
  /** Метка записи: ответ прежнего запроса не должен снимать удержание, поставленное после. */
  const stamp = useRef(0)
  const setTimes = useSetEventTimes()
  const moveBlock = useMoveTimeBlock()
  const setSlot = useSetTaskSlot()
  const router = useRouter()
  const hold = useRef<Hold | null>(null)
  /** Жест пальцем начат: страница под ним не прокручивается, иначе сетка уедет из-под блока. */
  const pinned = useRef(false)

  useEffect(() => {
    const pin = (event: TouchEvent) => {
      if (pinned.current) event.preventDefault()
    }
    // из пассивного слушателя прокрутку не отменить
    window.addEventListener('touchmove', pin, { passive: false })
    return () => {
      window.removeEventListener('touchmove', pin)
      if (hold.current) clearTimeout(hold.current.timer)
    }
  }, [])

  function release() {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
    pinned.current = false
  }

  const grab: GrabHandler = (event, kind, base, dragging) => {
    if (event.button !== 0) return
    const column = event.currentTarget.closest<HTMLElement>('[data-day]')
    if (!column) return

    const grabbed = minutesIn(column, event.clientY)
    const range = kind === 'select' ? selection(base.day, grabbed, grabbed) : base
    const start: Drag = { kind, target: dragging, base, range, grabbed }

    // палец сначала листает сетку: жест начинается, только если его подержали на месте
    if (event.pointerType === 'touch') {
      release()
      const { pointerId, clientX: x, clientY: y } = event
      const timer = setTimeout(() => {
        hold.current = null
        pinned.current = true
        column.setPointerCapture(pointerId)
        navigator.vibrate?.(10)
        setDrag(start)
      }, HOLD_MS)
      hold.current = { timer, pointerId, x, y, start }
      return
    }

    event.preventDefault()
    column.setPointerCapture(event.pointerId)
    setDrag(start)
  }

  /**
   * Отрезок считается от точки, за которую взялись, а не от прошлого шага: движение, не
   * поспевшее за отрисовкой, ничего не сдвигает лишний раз.
   */
  function advance(event: React.PointerEvent) {
    const waiting = hold.current
    if (waiting?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - waiting.x, event.clientY - waiting.y) > HOLD_SLOP_PX) release()
      return
    }

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

  /** Выделение отпустили или блок отпустили там же, где взяли: это щелчок, а не правка времени. */
  function click({ kind, range, target }: Drag) {
    if (kind === 'select') {
      onSelect(range)
      return
    }
    if (!target) return

    if (target.type === 'event') {
      const clicked = events.find((one) => one.id === target.id)
      if (clicked) onOpen(clicked)
      return
    }
    if (target.type === 'task') {
      const clicked = tasks.find((one) => one.id === target.id)
      if (clicked) onOpenTask({ id: clicked.id, title: clicked.title })
      return
    }
    const clicked = blocks.find((one) => one.id === target.id)
    if (clicked) router.push(cardHref(clicked.cardId))
  }

  function finish() {
    // палец отпустили раньше, чем жест начался: это касание
    const waiting = hold.current
    release()
    if (waiting) {
      click(waiting.start)
      return
    }

    const current = drag
    setDrag(null)
    if (!current) return

    if (current.kind === 'select' || sameRange(current.range, current.base)) {
      click(current)
      return
    }
    const moving = current.target
    if (!moving) return

    const key = targetKey(moving)
    const mine = ++stamp.current
    const holding = { target: moving, range: current.range, stamp: mine }
    setPending((shown) => new Map(shown).set(key, holding))
    const times = rangeTimes(current.range)
    const settle = {
      onSettled: () =>
        setPending((shown) => {
          if (shown.get(key)?.stamp !== mine) return shown
          const rest = new Map(shown)
          rest.delete(key)
          return rest
        }),
    }
    if (moving.type === 'event') {
      setTimes.mutate({ id: moving.id, times }, settle)
      return
    }
    if (moving.type === 'task') {
      // день уезжает в Google сроком, часы остаются у нас: одним `PATCH`, чтобы не разъехались
      const { day, ...slot } = rangeSlot(current.range)
      setSlot.mutate({ id: moving.id, due: day, slot }, settle)
      return
    }
    moveBlock.mutate({ id: moving.id, startsAt: times.startsAt, endsAt: times.endsAt }, settle)
  }

  // жест перебивает своё же удержание: двух заготовок под одной целью быть не должно
  const held = useMemo(() => {
    const shown = new Map<string, Held>(pending)
    if (drag) shown.set(drag.target ? targetKey(drag.target) : SELECTION, drag)
    return [...shown.values()]
  }, [drag, pending])

  return {
    held,
    grab,
    advance,
    finish,
    cancel: () => {
      release()
      setDrag(null)
    },
    error: setTimes.error ?? moveBlock.error ?? setSlot.error,
  }
}
