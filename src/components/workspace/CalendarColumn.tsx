'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { CalendarGrid } from '@/components/calendar/CalendarGrid'
import { calendarQuery } from '@/lib/calendar-query'
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
  const days = daysOf(mode, anchor)
  const events = useQuery(calendarQuery(days[0], days[days.length - 1]))

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-800">
      <div className="flex items-baseline justify-between px-3 pt-3">
        <h2 className="text-sm font-medium text-neutral-300">{rangeLabel(mode, days)}</h2>
        <Link href="/settings" className="text-xs text-neutral-500 hover:text-neutral-300">
          Настройки
        </Link>
      </div>

      <div className="flex items-center gap-1 px-3 py-2">
        <Step label="Назад" onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))}>
          ‹
        </Step>
        <Step label="Сегодня" onClick={() => setAnchor(moscowToday())}>
          Сегодня
        </Step>
        <Step label="Вперёд" onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))}>
          ›
        </Step>
        <div className="ml-auto flex rounded border border-neutral-800">
          {(Object.keys(MODE_LABEL) as CalendarMode[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
              className={`px-2 py-1 text-xs outline-none first:rounded-l last:rounded-r focus-visible:ring-1 focus-visible:ring-neutral-600 ${
                mode === value
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {MODE_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      <CalendarGrid days={days} events={events.data ?? []} />
    </aside>
  )
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
      className="rounded px-2 py-1 text-xs text-neutral-400 outline-none hover:bg-neutral-900 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-600"
    >
      {children}
    </button>
  )
}
