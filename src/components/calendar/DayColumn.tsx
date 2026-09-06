'use client'

import { timeLabel } from '@/lib/calendar-drag'
import { MINUTES_IN_DAY, isToday } from '@/lib/calendar-grid'
import type { PlacedEvent } from '@/lib/calendar-layout'
import type { GridDraft, GridItem } from '@/lib/calendar-scene'
import { EventBlock, TaskBlock, TimeBlockChip } from './Blocks'
import { DAY_PX, HOUR_LINES, type OpenHandler, type TaskOpenHandler } from './grid'
import type { GridDrag } from './use-grid-drag'

/**
 * Колонка одного дня: разложенные блоки, заготовки под курсором и линия текущего времени.
 * Жест на сетке цепляется за саму колонку, а не за блоки — выделять пустое место можно
 * только здесь, и захват указателя тоже идёт отсюда.
 */
export function DayColumn({
  day,
  placed,
  drafts,
  drag,
  now,
  line,
  register,
  onOpen,
  onOpenTask,
}: {
  day: string
  placed: PlacedEvent<GridItem>[]
  drafts: GridDraft[]
  drag: GridDrag
  now: Date | null
  /** Минута линии текущего времени, если она в этом дне. */
  line: number | null
  register: (node: HTMLElement | null) => void
  onOpen: OpenHandler
  onOpenTask: TaskOpenHandler
}) {
  return (
    <div
      data-day={day}
      ref={register}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        drag.grab(event, 'select', { day, start: 0, end: 0 }, null)
      }}
      onPointerMove={drag.advance}
      onPointerUp={drag.finish}
      onPointerCancel={drag.cancel}
      className={`relative border-l border-white/5 select-none first:border-l-0 ${
        isToday(day, now ?? undefined) ? 'bg-white/4' : ''
      }`}
      style={{ backgroundImage: HOUR_LINES }}
    >
      {placed.map((one) =>
        one.event.kind !== 'event' ? (
          <TimeBlockChip
            key={one.key}
            placed={{ ...one, event: one.event.block }}
            day={day}
            onGrab={drag.grab}
          />
        ) : one.event.event.taskId ? (
          <TaskBlock
            key={one.key}
            placed={{ ...one, event: one.event.event }}
            taskId={one.event.event.taskId}
            onOpen={onOpenTask}
          />
        ) : (
          <EventBlock
            key={one.key}
            placed={{ ...one, event: one.event.event }}
            day={day}
            onGrab={drag.grab}
            onOpen={onOpen}
          />
        ),
      )}
      {drafts.map((draft, index) => (
        <Draft key={index} {...draft} />
      ))}
      {line !== null ? <NowLine minutes={line} /> : null}
    </div>
  )
}

/**
 * Заготовка под курсором: выделение под новое событие или блок, который тащат. Событий не
 * ловит — иначе она закрывала бы колонку, над которой её держат.
 */
function Draft({ range, event, title }: GridDraft) {
  const color = event?.color ?? null

  return (
    <div
      className={`pointer-events-none absolute right-0.5 left-0 z-10 overflow-hidden rounded-[11px] px-1.5 text-[10px] leading-tight text-fog ${
        color ? 'opacity-80' : 'border border-dashed border-accent-line bg-accent-wash'
      }`}
      style={{
        top: (range.start / MINUTES_IN_DAY) * DAY_PX,
        height: ((range.end - range.start) / MINUTES_IN_DAY) * DAY_PX,
        ...(color
          ? {
              border: `1px solid ${color}66`,
              background: `linear-gradient(135deg, ${color}a6, ${color}66)`,
            }
          : {}),
      }}
    >
      <div className="truncate font-mono text-[9.5px] text-white/70 tabular-nums">
        {timeLabel(range)}
      </div>
      {event ? (
        <div className="truncate font-medium">{event.title ?? 'Без названия'}</div>
      ) : title ? (
        <div className="truncate font-medium">{title}</div>
      ) : null}
    </div>
  )
}

function NowLine({ minutes }: { minutes: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 left-0 z-10 h-px bg-linear-to-r from-alarm to-transparent"
      style={{ top: (minutes / MINUTES_IN_DAY) * DAY_PX }}
    >
      <span className="beacon absolute -top-[3px] -left-[3px] block size-[7px] rounded-full bg-alarm shadow-[0_0_12px_var(--color-alarm)]" />
    </div>
  )
}
