'use client'

import { useEffect, useRef, useState } from 'react'
import {
  HOURS,
  MINUTES_IN_DAY,
  dayNumber,
  isToday,
  nowOffset,
  weekdayLabel,
} from '@/lib/calendar-grid'
import { placeDay, type PlacedEvent } from '@/lib/calendar-layout'
import type { CalendarEventView } from '@/lib/calendar-view'
import { moscowParts } from '@/lib/dates'

const HOUR_PX = 44
const DAY_PX = HOUR_PX * 24
const TICK_MS = 30_000
/** Доля высоты, на которой хочется видеть текущее время после открытия. */
const SCROLL_ANCHOR = 0.35

const RAIL = 'w-9 shrink-0'

/** Ниже блок читается только как полоса цвета: время в нём уже не помещается. */
const TIME_VISIBLE_PX = 28

type Props = { days: string[]; events: CalendarEventView[] }

export function CalendarGrid({ days, events }: Props) {
  // на сервере момента нет: отрисуй его там — и разметка разойдётся с браузерной
  const [now, setNow] = useState<Date | null>(null)
  const scroll = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const line = now ? nowOffset(days, now) : null
  // события на весь день во временную сетку не попадают: они полосой сверху, инвариант 3
  const timed = events.filter(isTimed)

  const scrolled = useRef(false)
  useEffect(() => {
    const box = scroll.current
    if (!box || scrolled.current || now === null) return

    scrolled.current = true
    const minutes = nowOffset(days, now)?.minutes ?? 9 * 60
    box.scrollTop = (minutes / MINUTES_IN_DAY) * DAY_PX - box.clientHeight * SCROLL_ANCHOR
  }, [days, now])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-neutral-800 pr-2">
        <div className={RAIL} />
        <div className="grid flex-1" style={{ gridTemplateColumns: columns(days.length) }}>
          {days.map((day) => (
            <div key={day} className="px-1 pb-1 text-center">
              <div className="text-[10px] text-neutral-500">{weekdayLabel(day)}</div>
              <div
                className={
                  isToday(day, now ?? undefined)
                    ? 'text-sm font-medium text-red-400'
                    : 'text-sm text-neutral-300'
                }
              >
                {dayNumber(day)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="flex" style={{ height: DAY_PX }}>
          <div className={`relative ${RAIL}`}>
            {HOURS.slice(1).map((hour) => (
              <div
                key={hour}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-neutral-600 tabular-nums"
                style={{ top: hour * HOUR_PX }}
              >
                {String(hour).padStart(2, '0')}
              </div>
            ))}
          </div>
          <div className="grid flex-1" style={{ gridTemplateColumns: columns(days.length) }}>
            {days.map((day) => (
              <div
                key={day}
                data-day={day}
                className={`relative border-l border-neutral-800 first:border-l-0 ${
                  isToday(day, now ?? undefined) ? 'bg-neutral-900/60' : ''
                }`}
                style={{ backgroundImage: HOUR_LINES }}
              >
                {placeDay(timed, day).map((placed) => (
                  <EventBlock key={placed.key} placed={placed} />
                ))}
                {line?.date === day ? <NowLine minutes={line.minutes} /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

type TimedView = CalendarEventView & { startsAt: string; endsAt: string }

function isTimed(event: CalendarEventView): event is TimedView {
  return !event.allDay && event.startsAt !== null && event.endsAt !== null
}

function EventBlock({ placed }: { placed: PlacedEvent<TimedView> }) {
  const { event, start, end, column, columns } = placed
  const height = ((end - start) / MINUTES_IN_DAY) * DAY_PX
  const title = event.title ?? 'Без названия'
  const time = moscowParts(event.startsAt).time

  return (
    <div
      className="absolute overflow-hidden rounded-[3px] border-l-2 px-1 py-px text-[10px] leading-tight text-neutral-100"
      style={{
        top: (start / MINUTES_IN_DAY) * DAY_PX,
        height,
        left: `${(column / columns) * 100}%`,
        width: `calc(${100 / columns}% - 2px)`,
        borderColor: event.color,
        backgroundColor: `${event.color}44`,
      }}
      title={`${time} ${title}`}
    >
      {height >= TIME_VISIBLE_PX ? (
        <div className="truncate text-neutral-300 tabular-nums">{time}</div>
      ) : null}
      <div className="truncate font-medium">{title}</div>
    </div>
  )
}

function NowLine({ minutes }: { minutes: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 left-0 z-10 h-px bg-red-500"
      style={{ top: (minutes / MINUTES_IN_DAY) * DAY_PX }}
    >
      <span className="absolute -top-[3px] -left-[3px] block size-[7px] rounded-full bg-red-500" />
    </div>
  )
}

function columns(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`
}

// часовая разметка фоном, а не строками: 24 пустых div на каждый день сетке не нужны
const HOUR_LINES = `repeating-linear-gradient(
  to bottom,
  var(--color-neutral-800) 0 1px,
  transparent 1px ${HOUR_PX}px
)`
