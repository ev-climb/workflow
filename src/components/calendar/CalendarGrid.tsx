'use client'

import { useDndMonitor } from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { draggedCard } from '@/lib/board-move'
import { useDropDue } from '@/lib/board-mutations'
import { covers, dayAt, dropMinutes, dropTime, isDueDrop, pointerAt } from '@/lib/calendar-drop'
import {
  HOURS,
  MINUTES_IN_DAY,
  dayNumber,
  isToday,
  nowOffset,
  weekdayLabel,
} from '@/lib/calendar-grid'
import {
  placeAllDay,
  placeDay,
  placeDues,
  type PlacedAllDay,
  type PlacedDue,
  type PlacedEvent,
} from '@/lib/calendar-layout'
import type { CalendarEventView, CardDueView } from '@/lib/calendar-view'
import { isOverdue, moscowParts } from '@/lib/dates'

const HOUR_PX = 44
const DAY_PX = HOUR_PX * 24
const TICK_MS = 30_000
/** Доля высоты, на которой хочется видеть текущее время после открытия. */
const SCROLL_ANCHOR = 0.35

const RAIL = 'w-9 shrink-0'

const ALL_DAY_PX = 16
/** Выше полоса не растёт, а прокручивается: сетка со временем важнее списка дат. */
const ALL_DAY_MAX_PX = ALL_DAY_PX * 4

const DUE_PX = 14
const DUE_MAX_PX = DUE_PX * 4

/** Ниже блок читается только как полоса цвета: время в нём уже не помещается. */
const TIME_VISIBLE_PX = 28

/** Куда встанет срок, если отпустить карточку сейчас. Без минут — день без времени. */
type Aim = { date: string; minutes: number | null }

type Props = { days: string[]; events: CalendarEventView[]; dues: CardDueView[] }

export function CalendarGrid({ days, events, dues }: Props) {
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
  const allDay = placeAllDay(events.filter(isAllDay), days)
  // срок — не событие и не отрезок времени: своя полоса под событиями на весь день
  const placedDues = placeDues(dues, days)

  const scrolled = useRef(false)
  useEffect(() => {
    const box = scroll.current
    if (!box || scrolled.current || now === null) return

    scrolled.current = true
    const minutes = nowOffset(days, now)?.minutes ?? 9 * 60
    box.scrollTop = (minutes / MINUTES_IN_DAY) * DAY_PX - box.clientHeight * SCROLL_ANCHOR
  }, [days, now])

  const setDue = useDropDue()
  const heads = useRef<HTMLDivElement>(null)
  const cells = useRef<HTMLDivElement>(null)
  const [aim, setAim] = useState<Aim | null>(null)

  /**
   * Куда встанет срок брошенной карточки: день — по колонке под курсором, время — по
   * высоте точки в ней. Шапка дня даёт срок без времени. Мерки снимаются на месте:
   * сетку за время жеста могли прокрутить.
   */
  function aimAt(): Aim | null {
    const at = pointerAt()
    if (at === null) return null

    const head = dayAt(heads.current, at, days)
    if (head !== null) return { date: head, minutes: null }

    const box = scroll.current
    const day = covers(box, at) ? dayAt(cells.current, at, days) : null
    if (!box || day === null) return null

    const offset = at.y - box.getBoundingClientRect().top + box.scrollTop
    return { date: day, minutes: dropMinutes(offset, DAY_PX) }
  }

  useDndMonitor({
    onDragMove: ({ active }) => setAim(draggedCard(active.data.current) ? aimAt() : null),

    onDragEnd: ({ active, over }) => {
      const card = draggedCard(active.data.current)
      // цель календаря одна на всех, а куда именно попали — только что посчитано по сетке
      const aimed = card && isDueDrop(over?.data.current) ? aimAt() : null
      setAim(null)
      if (!card || aimed === null) return

      setDue.mutate({
        boardId: card.boardId,
        cardId: card.card.id,
        date: aimed.date,
        time: aimed.minutes === null ? null : dropTime(aimed.minutes),
      })
    },

    onDragCancel: () => setAim(null),
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Failure error={setDue.error} className="shrink-0 px-3 pb-1" />

      <div className="flex shrink-0 border-b border-neutral-800 pr-2">
        <div className={RAIL} />
        <div
          ref={heads}
          className="grid flex-1"
          style={{ gridTemplateColumns: columns(days.length) }}
        >
          {days.map((day) => (
            <div
              key={day}
              data-day-head={day}
              className={`rounded px-1 pb-1 text-center ${
                // шапка дня принимает карточку: срок встанет на этот день без времени
                aim?.date === day && aim.minutes === null ? 'bg-neutral-700' : ''
              }`}
            >
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

      {allDay.length > 0 ? (
        <div
          className="flex shrink-0 overflow-y-auto border-b border-neutral-800 pr-2"
          style={{ maxHeight: ALL_DAY_MAX_PX }}
        >
          <div className={RAIL} />
          <div
            className="grid flex-1 gap-px py-px"
            style={{
              gridTemplateColumns: columns(days.length),
              gridAutoRows: `${ALL_DAY_PX}px`,
            }}
          >
            {allDay.map((placed) => (
              <AllDayStripe key={placed.key} placed={placed} />
            ))}
          </div>
        </div>
      ) : null}

      {placedDues.length > 0 ? (
        <div
          className="flex shrink-0 overflow-y-auto border-b border-neutral-800 pr-2"
          style={{ maxHeight: DUE_MAX_PX }}
        >
          <div className={RAIL} />
          <div
            className="grid flex-1 gap-px py-px"
            style={{
              gridTemplateColumns: columns(days.length),
              gridAutoRows: `${DUE_PX}px`,
            }}
          >
            {placedDues.map((placed) => (
              <DueStripe key={placed.due.id} placed={placed} now={now} />
            ))}
          </div>
        </div>
      ) : null}

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
          <div
            ref={cells}
            className="grid flex-1"
            style={{ gridTemplateColumns: columns(days.length) }}
          >
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
                {aim?.date === day && aim.minutes !== null ? (
                  <DueMark minutes={aim.minutes} />
                ) : null}
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

type AllDayView = CalendarEventView & { startDate: string; endDate: string }

function isAllDay(event: CalendarEventView): event is AllDayView {
  return event.allDay && event.startDate !== null && event.endDate !== null
}

function AllDayStripe({ placed }: { placed: PlacedAllDay<AllDayView> }) {
  const { event, index, span, lane, clippedStart, clippedEnd } = placed
  const title = event.title ?? 'Без названия'

  return (
    <div
      className={`overflow-hidden rounded-[3px] px-1 text-[10px] leading-[15px] font-medium text-neutral-100 ${
        clippedStart ? 'rounded-l-none' : 'border-l-2'
      } ${clippedEnd ? 'rounded-r-none' : ''}`}
      style={{
        gridColumn: `${index + 1} / span ${span}`,
        gridRow: lane + 1,
        borderColor: event.color,
        backgroundColor: `${event.color}44`,
      }}
      title={title}
    >
      <div className="truncate">{title}</div>
    </div>
  )
}

/**
 * Срок карточки. Событие — заливка цветом календаря, срок — пунктирный контур без
 * заливки: с одного взгляда видно, что это не встреча, а граница работы.
 *
 * Ссылка обычная, не `next/link`: карточку открывает страница стола, подставляя её доску
 * в слот, и делает это на серверной отрисовке. Мягкий переход состояние стола не
 * пересобирает, и карточка чужой доски осталась бы неоткрытой.
 */
function DueStripe({ placed, now }: { placed: PlacedDue<CardDueView>; now: Date | null }) {
  const { due, index, lane } = placed
  const overdue = now !== null && isOverdue(due.dueAt, due.dueDone, due.dueHasTime, now.getTime())
  const time = due.dueHasTime ? moscowParts(due.dueAt).time : null

  return (
    <a
      href={`/?card=${due.id}`}
      title={`Срок${time ? ` ${time}` : ''}: ${due.title} — ${due.boardTitle}`}
      className={`flex items-center gap-1 overflow-hidden rounded-[3px] border border-dashed px-1 text-[10px] leading-[12px] outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 ${
        overdue
          ? 'border-red-800 text-red-300 hover:bg-red-950/50'
          : due.dueDone
            ? 'border-neutral-800 text-neutral-500 line-through hover:bg-neutral-900'
            : 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'
      }`}
      style={{ gridColumn: index + 1, gridRow: lane + 1 }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rotate-45 border border-current" />
      {time ? <span className="shrink-0 tabular-nums">{time}</span> : null}
      <span className="truncate">{due.title}</span>
    </a>
  )
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

/** Время, которое достанется сроку, если отпустить карточку здесь. */
function DueMark({ minutes }: { minutes: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 left-0 z-20 border-t border-dashed border-neutral-200"
      style={{ top: (minutes / MINUTES_IN_DAY) * DAY_PX }}
    >
      <span className="absolute -top-2 left-0 rounded-sm bg-neutral-200 px-0.5 text-[10px] leading-4 font-medium text-neutral-900 tabular-nums">
        {dropTime(minutes)}
      </span>
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
