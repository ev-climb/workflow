'use client'

import { useQuery } from '@tanstack/react-query'
import { Popover } from 'radix-ui'
import type { SyntheticEvent } from 'react'
import { Failure } from '@/components/board/Failure'
import { dailyStatsQuery } from '@/lib/notes-query'
import type { DailyPeriod, DayState } from '@/server/services/daily'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

const CELL: Record<DayState, string> = {
  complete: 'bg-done/75 shadow-[0_0_8px_oklch(0.75_0.14_168/0.55)]',
  partial: 'bg-done/20',
  empty: 'bg-white/6',
  future: 'border border-dashed border-white/8',
}

function periodLabel(days: number | null): string {
  if (days === null) return 'Всё время'
  if (days === 365) return 'Год'
  return `${days} дней`
}

function daysWord(count: number): string {
  const tail = count % 100 >= 11 && count % 100 <= 14 ? 5 : count % 10
  return tail === 1 ? 'день' : tail >= 2 && tail <= 4 ? 'дня' : 'дней'
}

// всплывашка живёт в портале, но React ведёт события по дереву компонентов: без этого
// щелчок по ней раскрывал бы список «Сегодня» в правку
const keep = (event: SyntheticEvent) => event.stopPropagation()

/** Статистика списка «Сегодня»: сколько дней закрыто целиком за каждый период. */
export function DailyStats() {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Статистика выполнения"
        title="Статистика выполнения"
        onClick={keep}
        onKeyDown={keep}
        className="btn-quiet grid size-6 shrink-0 place-items-center p-0 text-fog-dim data-[state=open]:text-done"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <line x1="5" y1="20" x2="5" y2="13" />
          <line x1="12" y1="20" x2="12" y2="5" />
          <line x1="19" y1="20" x2="19" y2="10" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          onClick={keep}
          onKeyDown={keep}
          className="surface-menu z-50 w-72 p-4 outline-none"
        >
          <Stats />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Читается только открытой всплывашкой: закрытой статистика ни к чему. */
function Stats() {
  const stats = useQuery(dailyStatsQuery)

  if (!stats.data) {
    return stats.error ? (
      <Failure error={stats.error} />
    ) : (
      <p className="text-xs text-fog-dim">Считаю…</p>
    )
  }

  const { periods, streak, weeks } = stats.data

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[13px] font-semibold text-fog">Список закрыт целиком</p>
        <p className="text-[11.5px] text-fog-dim">Сегодня в счёт, только когда уже закрыто</p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {periods.map((period) => (
          <Period key={period.days ?? 'all'} period={period} />
        ))}
      </ul>

      <p className="text-xs text-fog-muted">
        Серия — <span className="font-semibold text-fog">{streak.current}</span>{' '}
        {daysWord(streak.current)}, лучшая — {streak.best}
      </p>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <span key={day} className="text-center font-mono text-[9.5px] text-fog-faint uppercase">
            {day}
          </span>
        ))}
        {weeks.flat().map(({ day, state }) => (
          <span key={day} title={day} className={`aspect-square rounded-[5px] ${CELL[state]}`} />
        ))}
      </div>
    </div>
  )
}

function Period({ period }: { period: DailyPeriod }) {
  const share = period.counted ? Math.round((period.complete / period.counted) * 100) : 0

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="text-fog-muted">{periodLabel(period.days)}</span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-fog-dim tabular-nums">
          {period.complete} из {period.counted}
        </span>
        <span className="w-9 text-right font-mono text-[11px] font-semibold text-fog tabular-nums">
          {share}%
        </span>
      </div>
      <div className="note-progress note-progress-done">
        <span style={{ width: `${share}%` }} />
      </div>
    </li>
  )
}
