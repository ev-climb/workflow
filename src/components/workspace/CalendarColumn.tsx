'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Mark } from '@/components/brand/Logo'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { CreateDialog } from '@/components/calendar/CreateDialog'
import { EventPanel } from '@/components/calendar/EventPanel'
import { TaskPanel } from '@/components/calendar/TaskPanel'
import { SettingsButton } from '@/components/settings/SettingsButton'
import type { Range } from '@/lib/calendar-drag'
import { calendarQuery, duesQuery, tasksQuery, timeBlocksQuery } from '@/lib/calendar-query'
import {
  daysOf,
  isFullScreen,
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

  // неделя раскрывается на всё окно: семь колонок в боковую колонку не влезают
  const full = isFullScreen(mode)

  return (
    <aside
      className={`surface-panel calendar-shell flex min-h-0 shrink-0 flex-col border-r border-hair motion-reduce:transition-none ${
        full ? 'w-full' : 'w-76'
      }`}
    >
      {/* шапка одинакова в обоих видах: переключатель не должен уезжать при смене вида */}
      <div className="flex h-[54px] shrink-0 items-center justify-between gap-3 border-b border-hair pr-4 pl-[18px]">
        <span className="flex items-center gap-2.5">
          <Mark size={32} className="[filter:drop-shadow(0_2px_10px_oklch(0.6_0.13_280/0.45))]" />
          <span className="text-[14.5px] leading-none font-bold tracking-[-0.015em]">
            Work<span className="font-semibold text-fog-muted">Flow</span>
          </span>
        </span>
        <SettingsButton />
      </div>

      <div className="flex flex-col gap-3.5 px-[18px] pt-[18px] pb-3.5">
        <h2 className="truncate text-[17px] font-semibold tracking-[-0.015em] text-fog">
          {rangeLabel(mode, days)}
        </h2>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Step label="Назад" onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))}>
              ‹
            </Step>
            <button
              type="button"
              onClick={() => setAnchor(moscowToday())}
              className="rounded-[10px] border border-hair bg-white/5 px-2.5 py-1 text-[12.5px] font-medium text-fog-muted transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-accent-line focus-visible:outline-none"
            >
              Сегодня
            </button>
            <Step label="Вперёд" onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))}>
              ›
            </Step>
          </div>
          <div className="segment shrink-0">
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

      {range ? <CreateDialog range={range} onClose={() => setRange(null)} /> : null}
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
      className="grid size-[26px] place-items-center rounded-[9px] text-[14px] text-fog-muted transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-1 focus-visible:ring-accent-line focus-visible:outline-none"
    >
      {children}
    </button>
  )
}
