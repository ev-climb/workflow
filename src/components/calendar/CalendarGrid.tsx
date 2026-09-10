'use client'

import { useRef } from 'react'
import { Failure } from '@/components/board/Failure'
import type { Range } from '@/lib/calendar-drag'
import { HOURS, dayNumber, isToday, nowOffset, weekdayLabel } from '@/lib/calendar-grid'
import type { GridDraft } from '@/lib/calendar-scene'
import type { CalendarEventView, CardDueView, TimeBlockView } from '@/lib/calendar-view'
import type { CalendarTask } from '@/server/services/google-tasks'
import { DayColumn } from './DayColumn'
import { AllDayRow, StripeRow } from './Stripes'
import { DAY_PX, HOUR_PX, RAIL, columns, type OpenHandler, type TaskOpenHandler } from './grid'
import { useDayColumns } from './use-day-columns'
import { useFirstScroll, useNow } from './use-grid-clock'
import { useGridDrag } from './use-grid-drag'
import { useGridDrop } from './use-grid-drop'
import { useScene } from './use-scene'
import { useStripeDrag } from './use-stripe-drag'

type Props = {
  days: string[]
  events: CalendarEventView[]
  blocks: TimeBlockView[]
  dues: CardDueView[]
  tasks: CalendarTask[]
  onSelect: (range: Range) => void
  onOpen: OpenHandler
  onOpenTask: TaskOpenHandler
}

/**
 * Сетка недели или дня: шапка с числами, полосы над сеткой и колонки со временем. Здесь
 * только каркас — жесты живут в своих хуках, раскладка собирается `useScene`, а сами
 * блоки и полосы рисуют `DayColumn` и `Stripes`.
 */
export function CalendarGrid({
  days,
  events,
  blocks,
  dues,
  tasks,
  onSelect,
  onOpen,
  onOpenTask,
}: Props) {
  const now = useNow()
  const scroll = useRef<HTMLDivElement>(null)
  useFirstScroll(scroll, days, now)

  const dayColumns = useDayColumns(days)
  const drag = useGridDrag({ events, blocks, tasks, onSelect, onOpen, onOpenTask })
  const stripes = useStripeDrag({ days, onOpen, onOpenTask })
  const drop = useGridDrop(dayColumns)

  const scene = useScene({
    days,
    events,
    blocks,
    dues,
    tasks,
    held: drag.held,
    heldStripes: stripes.held,
  })

  const drafts: GridDraft[] = [
    ...scene.drafts,
    ...(drop.dropping
      ? [{ range: drop.dropping.range, event: null, title: drop.dropping.title }]
      : []),
  ]

  const line = now ? nowOffset(days, now) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-hair px-3 pb-1">
        <div className={RAIL} />
        <div className="grid flex-1" style={{ gridTemplateColumns: columns(days.length) }}>
          {days.map((day) => (
            <div key={day} className="px-1 pb-1 text-center">
              <div className="font-mono text-[10.5px] tracking-[0.16em] text-fog-faint uppercase">
                {weekdayLabel(day)}
              </div>
              <div
                className={
                  isToday(day, now ?? undefined)
                    ? 'text-[19px] font-semibold text-alarm [text-shadow:0_0_22px_var(--color-alarm-line)]'
                    : 'text-[19px] font-medium text-fog-muted'
                }
              >
                {dayNumber(day)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AllDayRow placed={scene.allDay} days={days.length} grip={stripes.grip} onOpen={onOpen} />
      <StripeRow
        placed={scene.stripes}
        days={days.length}
        now={now}
        grip={stripes.grip}
        onOpenTask={onOpenTask}
      />

      <Failure error={drag.error ?? stripes.error ?? drop.error} className="px-3 pt-1" />

      <div
        ref={(node) => {
          scroll.current = node
          drop.setNodeRef(node)
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3"
      >
        <div aria-hidden className="sticky top-0 z-10 h-0">
          <div className="h-[26px] bg-linear-to-b from-ink/95 to-transparent" />
        </div>
        <div className="flex" style={{ height: DAY_PX }}>
          <div className={`relative ${RAIL}`}>
            {HOURS.slice(1).map((hour) => (
              <div
                key={hour}
                className="absolute right-1.5 -translate-y-1/2 font-mono text-[10.5px] text-fog-faint tabular-nums"
                style={{ top: hour * HOUR_PX }}
              >
                {String(hour).padStart(2, '0')}
              </div>
            ))}
          </div>
          <div className="grid flex-1" style={{ gridTemplateColumns: columns(days.length) }}>
            {days.map((day, index) => (
              <DayColumn
                key={day}
                day={day}
                placed={scene.placed[index]}
                drafts={drafts.filter((draft) => draft.range.day === day)}
                drag={drag}
                now={now}
                line={line?.date === day ? line.minutes : null}
                register={dayColumns.register(day)}
                onOpen={onOpen}
                onOpenTask={onOpenTask}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
