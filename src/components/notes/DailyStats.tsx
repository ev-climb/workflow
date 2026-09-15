'use client'

import { useQuery } from '@tanstack/react-query'
import { Popover } from 'radix-ui'
import type { SyntheticEvent } from 'react'
import { Failure } from '@/components/board/Failure'
import { dailyStatsQuery } from '@/lib/notes-query'
import type { DayState } from '@/server/services/daily'

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKDAYS = ['пн', '', 'ср', '', 'пт', '', '']

const CELL: Record<DayState, string> = {
  complete: 'bg-done/80',
  partial: 'bg-done/25',
  empty: 'bg-white/6',
  future: '',
}

const STATE: Record<DayState, string> = {
  complete: 'закрыт целиком',
  partial: 'закрыт частично',
  empty: 'пусто',
  future: '',
}

function daysWord(count: number): string {
  const tail = count % 100 >= 11 && count % 100 <= 14 ? 5 : count % 10
  return tail === 1 ? 'день' : tail >= 2 && tail <= 4 ? 'дня' : 'дней'
}

// всплывашка живёт в портале, но React ведёт события по дереву компонентов: без этого
// щелчок по ней раскрывал бы список «Сегодня» в правку
const keep = (event: SyntheticEvent) => event.stopPropagation()

/** Статистика списка «Сегодня»: год по дням, как сетка вкладов на GitHub. */
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
          collisionPadding={16}
          className="surface-menu z-50 w-max max-w-[calc(100vw-2rem)] p-4 outline-none"
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

  const { complete, weeks } = stats.data

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] font-semibold text-fog">
        Список закрыт целиком{' '}
        <span className="font-normal text-fog-dim">
          — {complete} {daysWord(complete)} за год
        </span>
      </p>

      {/* на узком экране год не влезает: открываем прокрученным к сегодняшней неделе */}
      <div
        ref={(node) => {
          if (node) node.scrollLeft = node.scrollWidth
        }}
        className="overflow-x-auto"
      >
        <div className="flex w-max gap-[3px]">
          <div className="mr-1 flex flex-col gap-[3px] pt-4">
            {WEEKDAYS.map((day, at) => (
              <span key={at} className="h-2.5 font-mono text-[9px] leading-2.5 text-fog-faint">
                {day}
              </span>
            ))}
          </div>
          {weeks.map((week, at) => (
            <div key={week[0].day} className="relative flex flex-col gap-[3px] pt-4">
              <span className="absolute top-0 left-0 font-mono text-[9px] whitespace-nowrap text-fog-faint">
                {monthLabel(week[0].day, weeks[at - 1]?.[0].day)}
              </span>
              {week.map(({ day, state }) => (
                <span
                  key={day}
                  title={state === 'future' ? undefined : `${day} — ${STATE[state]}`}
                  className={`size-2.5 rounded-[2px] ${CELL[state]}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 text-[10.5px] text-fog-dim">
        {(['empty', 'partial', 'complete'] as const).map((state) => (
          <span key={state} className="flex items-center gap-1 not-first:ml-2">
            <span className={`size-2.5 rounded-[2px] ${CELL[state]}`} />
            {STATE[state]}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Подпись месяца над первой его неделей; у самой левой колонки подписи нет — она обрезана. */
function monthLabel(monday: string, previous: string | undefined): string {
  if (!previous) return ''
  const month = Number(monday.slice(5, 7))
  return month === Number(previous.slice(5, 7)) ? '' : MONTHS[month - 1]
}
