'use client'

import { useState } from 'react'
import { useMoveCardDue } from '@/lib/board-mutations'
import { addDays } from '@/lib/calendar-grid'
import { useSetEventTimes, useSetTaskDue } from '@/lib/calendar-mutations'
import type { StripeDrag, StripeTarget } from '@/lib/calendar-scene'
import { moscowParts } from '@/lib/dates'
import { cardHref, type OpenHandler, type TaskOpenHandler } from './grid'
import type { DayColumns } from './use-day-columns'

/** Чем полоса цепляется к переносу: захват указателя идёт на ней самой, как и у блока. */
export type Grip = {
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

export type StripeGesture = {
  /** Полоса под курсором или в записи: раскладка ставит её в день, где её держат. */
  held: StripeDrag | null
  grip: (target: StripeTarget) => Grip
  error: Error | null
}

/**
 * Жест на полосах над сеткой: событие на весь день, срок карточки и задача Google переезжают
 * целым днём, поэтому движение у них только вбок. Щелчок от переноса отличается здесь же —
 * отпустили в том же дне, значит открыть.
 */
export function useStripeDrag(input: {
  days: string[]
  columns: DayColumns
  onOpen: OpenHandler
  onOpenTask: TaskOpenHandler
}): StripeGesture {
  const { days, columns, onOpen, onOpenTask } = input
  const [drag, setDrag] = useState<StripeDrag | null>(null)
  /**
   * Полоса, уехавшая в запрос, но ещё не приехавшая обратно: пока идёт запись, держится на
   * новом дне — иначе она прыгала бы назад на время похода в сеть, как и блок на сетке.
   */
  const [pending, setPending] = useState<StripeDrag | null>(null)
  const setTimes = useSetEventTimes()
  const setTaskDue = useSetTaskDue()
  const moveDue = useMoveCardDue()

  function grab(event: React.PointerEvent, target: StripeTarget) {
    if (event.button !== 0) return
    const day = columns.columnAt(event.clientX)?.day
    if (!day) return

    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ target, from: day, day })
  }

  function advance(event: React.PointerEvent) {
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return

    const day = columns.columnAt(event.clientX)?.day
    if (day && day !== drag.day) setDrag({ ...drag, day })
  }

  function finish() {
    const current = drag
    setDrag(null)
    if (!current) return

    // отпустили в том же дне: это щелчок, а не перенос
    if (current.day === current.from) {
      open(current.target)
      return
    }
    move(current)
  }

  function open(target: StripeTarget) {
    if (target.kind === 'allday') onOpen(target.event)
    else if (target.kind === 'task') onOpenTask(target.task)
    else window.location.href = cardHref(target.due.id)
  }

  function move(held: StripeDrag) {
    setPending(held)
    const settle = { onSettled: () => setPending(null) }
    const { target } = held

    if (target.kind === 'task') {
      setTaskDue.mutate({ id: target.task.id, due: held.day }, settle)
      return
    }
    if (target.kind === 'due') {
      // час срока переезжает вместе с ним: сдвигается день работы, а не время в нём
      const time = target.due.dueHasTime ? moscowParts(target.due.dueAt).time : null
      moveDue.mutate(
        { boardId: target.due.boardId, cardId: target.due.id, due: { date: held.day, time } },
        settle,
      )
      return
    }

    // событие на весь день переезжает целиком: обе границы сдвигаются на одно число дней
    const shift = days.indexOf(held.day) - days.indexOf(held.from)
    const { event } = target
    setTimes.mutate(
      {
        id: event.id,
        times: {
          allDay: true,
          startDate: addDays(event.startDate, shift),
          endDate: addDays(event.endDate, shift),
        },
      },
      settle,
    )
  }

  return {
    held: drag ?? pending,
    grip: (target) => ({
      onPointerDown: (pointer) => grab(pointer, target),
      onPointerMove: advance,
      onPointerUp: finish,
      onPointerCancel: () => setDrag(null),
    }),
    error: setTimes.error ?? setTaskDue.error ?? moveDue.error,
  }
}
