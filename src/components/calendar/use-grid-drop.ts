'use client'

import {
  useDndMonitor,
  useDroppable,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import type { DragData } from '@/lib/board-move'
import type { CardView } from '@/lib/board-view'
import {
  CALENDAR_DROP,
  blockAt,
  isCalendarDrop,
  rangeTimes,
  snapMinutes,
  type Range,
} from '@/lib/calendar-drag'
import { useCreateTimeBlock } from '@/lib/calendar-mutations'
import { isNoteDrag, useNoteDrop } from '@/lib/note-drop'
import { noteHeading } from '@/lib/notes'
import type { NoteView } from '@/server/services/notes'
import type { DayColumns } from './use-day-columns'

type CardDrag = Extract<DragData, { type: 'card' }>

/** Что бросили на сетку: у карточки из этого выйдет тайм-блок, у заметки — окно переноса. */
type GridDrop =
  | { kind: 'card'; card: CardView; range: Range }
  | { kind: 'note'; note: NoteView; range: Range }

export type GridDropState = {
  /** Карточка или заметка над сеткой: под курсором её ждёт заготовка тайм-блока. */
  dropping: { title: string; range: Range } | null
  setNodeRef: (node: HTMLElement | null) => void
  error: Error | null
}

/** Приём броска с доски и из заметок: сетка объявлена одной целью на все свои колонки. */
export function useGridDrop(columns: DayColumns): GridDropState {
  const [dropping, setDropping] = useState<{ title: string; range: Range } | null>(null)
  const createBlock = useCreateTimeBlock()
  const dropNote = useNoteDrop()
  const grid = useDroppable({ id: CALENDAR_DROP, data: { type: CALENDAR_DROP } })

  /**
   * Курсор берётся из событий указателя, а не из `delta` жеста: dnd-kit подмешивает в неё
   * сдвиг прокрутки, но опору снимает с контейнеров колонки, а над сеткой сравнивает с
   * прокруткой календаря. Бросок из прокрученной колонки уезжал на полночь.
   * С клавиатуры курсора нет — `null`, и бросок на сетку не считается.
   */
  const pointer = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const follow = (event: PointerEvent) => {
      if (pointer.current) pointer.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener('pointermove', follow, { capture: true, passive: true })
    return () => window.removeEventListener('pointermove', follow, { capture: true })
  }, [])

  function dropOf(drag: DragMoveEvent | DragEndEvent): GridDrop | null {
    const data = drag.active.data.current
    if (!isCalendarDrop(drag.over?.data.current)) return null

    const card = (data as DragData | undefined)?.type === 'card' ? (data as CardDrag).card : null
    const dragged = isNoteDrag(data)
      ? ({ kind: 'note', note: data.note } as const)
      : card && ({ kind: 'card', card } as const)
    if (!dragged) return null

    const point = pointer.current
    if (!point) return null

    const hit = columns.columnAt(point.x)
    if (!hit) return null

    return {
      ...dragged,
      range: blockAt(hit.day, snapMinutes(point.y - hit.box.top, hit.box.height)),
    }
  }

  useDndMonitor({
    onDragStart: ({ activatorEvent }) => {
      pointer.current =
        activatorEvent instanceof MouseEvent
          ? { x: activatorEvent.clientX, y: activatorEvent.clientY }
          : null
    },
    onDragMove: (drag) => {
      const target = dropOf(drag)
      setDropping(
        target && {
          title: target.kind === 'card' ? target.card.title : noteHeading(target.note) || 'Заметка',
          range: target.range,
        },
      )
    },
    onDragEnd: (drag) => {
      const target = dropOf(drag)
      pointer.current = null
      setDropping(null)
      if (!target) return

      // заметка на сетке ещё не событие: что именно завести, спрашивает окно переноса
      if (target.kind === 'note') {
        dropNote({ kind: 'calendar', note: target.note, range: target.range })
        return
      }

      const times = rangeTimes(target.range)
      createBlock.mutate({
        cardId: target.card.id,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
      })
    },
    onDragCancel: () => {
      pointer.current = null
      setDropping(null)
    },
  })

  return { dropping, setNodeRef: grid.setNodeRef, error: createBlock.error }
}
