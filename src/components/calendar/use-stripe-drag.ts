'use client'

import { useMemo, useRef, useState } from 'react'
import { useMoveCardDue } from '@/lib/board-mutations'
import { addDays } from '@/lib/calendar-grid'
import { useSetEventTimes, useSetTaskDue } from '@/lib/calendar-mutations'
import { stripeKey, type StripeDrag, type StripeTarget } from '@/lib/calendar-scene'
import { moscowParts } from '@/lib/dates'
import { cardHref, type OpenHandler, type TaskOpenHandler } from './grid'
import type { DayColumns } from './use-day-columns'

/** Полоса в записи: метка отличает её от нового удержания той же полосы. */
type Pending = StripeDrag & { stamp: number }

/** Чем полоса цепляется к переносу: захват указателя идёт на ней самой, как и у блока. */
export type Grip = {
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

export type StripeGesture = {
  /** Полосы под курсором и в записи: раскладка ставит каждую в день, где её держат. */
  held: StripeDrag[]
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
   * Полосы, уехавшие в запрос, но ещё не приехавшие обратно: пока идёт запись, каждая
   * держится на новом дне — иначе она прыгала бы назад на время похода в сеть, как и блок
   * на сетке. По записи на полосу: одна на всех гасила бы соседний перенос.
   */
  const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(new Map())
  /** Метка записи: ответ прежнего запроса не должен снимать удержание, поставленное после. */
  const stamp = useRef(0)
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
    const { target } = held
    const key = stripeKey(target)
    const mine = ++stamp.current
    setPending((shown) => new Map(shown).set(key, { ...held, stamp: mine }))
    const settle = {
      onSettled: () =>
        setPending((shown) => {
          if (shown.get(key)?.stamp !== mine) return shown
          const rest = new Map(shown)
          rest.delete(key)
          return rest
        }),
    }

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

  // жест перебивает своё же удержание: двух полос под одной целью быть не должно
  const held = useMemo(() => {
    const shown = new Map<string, StripeDrag>(pending)
    if (drag) shown.set(stripeKey(drag.target), drag)
    return [...shown.values()]
  }, [drag, pending])

  return {
    held,
    grip: (target) => ({
      onPointerDown: (pointer) => grab(pointer, target),
      onPointerMove: advance,
      onPointerUp: finish,
      onPointerCancel: () => setDrag(null),
    }),
    error: setTimes.error ?? setTaskDue.error ?? moveDue.error,
  }
}
