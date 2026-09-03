'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { EventDialog } from '@/components/calendar/EventDialog'
import { EventPanel } from '@/components/calendar/EventPanel'
import { TaskPanel } from '@/components/calendar/TaskPanel'
import type { Range } from '@/lib/calendar-drag'
import { calendarQuery, duesQuery, tasksQuery, timeBlocksQuery } from '@/lib/calendar-query'
import {
  daysOf,
  moscowToday,
  rangeLabel,
  shiftAnchor,
  type CalendarMode,
} from '@/lib/calendar-grid'

const MODE_LABEL: Record<CalendarMode, string> = { day: 'День', week: 'Неделя' }

type Props = {
  mode: CalendarMode
  /** Сегодняшняя дата, посчитанная на сервере: первая отрисовка совпадает с браузерной. */
  today: string
  onModeChange: (mode: CalendarMode) => void
}

export function CalendarColumn({ mode, today, onModeChange }: Props) {
  const [anchor, setAnchor] = useState(today)
  const [range, setRange] = useState<Range | null>(null)
  const [opened, setOpened] = useState<{ id: string; title: string } | null>(null)
  const [openedTask, setOpenedTask] = useState<{ id: string; title: string } | null>(null)
  const days = daysOf(mode, anchor)
  const events = useQuery(calendarQuery(days[0], days[days.length - 1]))
  const dues = useQuery(duesQuery(days[0], days[days.length - 1]))
  const blocks = useQuery(timeBlocksQuery(days[0], days[days.length - 1]))
  const tasks = useQuery(tasksQuery(days[0], days[days.length - 1]))

  return (
    <aside className="surface-panel flex w-76 shrink-0 flex-col border-r border-hair">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-fog">
          {rangeLabel(mode, days)}
        </h2>
        <Link
          href="/settings"
          className="shrink-0 text-[12.5px] text-fog-dim transition-colors hover:text-fog"
        >
          Настройки
        </Link>
      </div>

      <div className="flex items-center gap-1 px-5 py-4">
        <Step label="Назад" onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))}>
          ‹
        </Step>
        <Step label="Сегодня" onClick={() => setAnchor(moscowToday())}>
          Сегодня
        </Step>
        <Step label="Вперёд" onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))}>
          ›
        </Step>
        <div className="segment ml-auto">
          {(Object.keys(MODE_LABEL) as CalendarMode[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
              className="segment-item px-3 py-1 text-xs font-medium"
            >
              {MODE_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      <CalendarGrid
        days={days}
        events={events.data ?? []}
        blocks={blocks.data ?? []}
        dues={dues.data ?? []}
        tasks={tasks.data ?? []}
        onSelect={setRange}
        onOpen={(event) => setOpened({ id: event.id, title: event.title ?? 'Без названия' })}
        onOpenTask={(task) => setOpenedTask({ id: task.id, title: task.title ?? 'Без названия' })}
      />

      {range ? <EventDialog range={range} onClose={() => setRange(null)} /> : null}
      {opened ? (
        <EventPanel eventId={opened.id} title={opened.title} onClose={() => setOpened(null)} />
      ) : null}
      {openedTask ? (
        <TaskPanel
          taskId={openedTask.id}
          title={openedTask.title}
          onClose={() => setOpenedTask(null)}
        />
      ) : null}

      <footer className="shrink-0 border-t border-hair px-5 py-3 text-xs text-fog-dim">
        {countLabel(events.data?.length ?? 0)}
      </footer>
    </aside>
  )
}

/** Подпись под сеткой: сколько событий попало в показанный отрезок. */
function countLabel(count: number): string {
  const tail = count % 100 >= 11 && count % 100 <= 14 ? 5 : count % 10
  const word = tail === 1 ? 'событие' : tail >= 2 && tail <= 4 ? 'события' : 'событий'
  return `${count} ${word} на виду`
}

function Step({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="btn-quiet px-2.5 py-1 text-[12.5px] focus-visible:ring-1 focus-visible:ring-accent-line"
    >
      {children}
    </button>
  )
}
