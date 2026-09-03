'use client'

import {
  useDndMonitor,
  useDroppable,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import { Failure } from '@/components/board/Failure'
import type { DragData } from '@/lib/board-move'
import {
  CALENDAR_DROP,
  blockAt,
  isCalendarDrop,
  moved,
  rangeOf,
  rangeTimes,
  resized,
  sameRange,
  selection,
  snapMinutes,
  timeLabel,
  type Range,
} from '@/lib/calendar-drag'
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
  placeStripe,
  stripeItems,
  type PlacedAllDay,
  type PlacedEvent,
  type PlacedStripe,
  type StripeEntry,
} from '@/lib/calendar-layout'
import { useCreateTimeBlock, useSetEventTimes, useSetTaskDone } from '@/lib/calendar-mutations'
import type { CalendarEventView, CardDueView, TimeBlockView } from '@/lib/calendar-view'
import type { CalendarTask } from '@/server/services/google-tasks'
import { TimeBlockMenu } from './TimeBlockMenu'
import { isOverdue, moscowParts } from '@/lib/dates'

const HOUR_PX = 46
const DAY_PX = HOUR_PX * 24
const TICK_MS = 30_000
/** Доля высоты, на которой хочется видеть текущее время после открытия. */
const SCROLL_ANCHOR = 0.35

const RAIL = 'w-8 shrink-0'

const ALL_DAY_PX = 16
/** Выше полоса не растёт, а прокручивается: сетка со временем важнее списка дат. */
const ALL_DAY_MAX_PX = ALL_DAY_PX * 4

const STRIPE_PX = 14
const STRIPE_MAX_PX = STRIPE_PX * 4

/** Ниже блок читается только как полоса цвета: время в нём уже не помещается. */
const TIME_VISIBLE_PX = 28

/** Ниже блока не хватает на две ручки: остаётся нижняя, за верхний край он не тянется. */
const BOTH_HANDLES_PX = 20

/** Что тянут: пустую сетку под новое событие, блок целиком или один из его краёв. */
type DragKind = 'select' | 'move' | 'start' | 'end'

type Drag = {
  kind: DragKind
  /** Событие, которое тащат; у выделения его нет. */
  id: string | null
  base: Range
  range: Range
  /** Минута, за которую взялись: сдвиг блока считается от неё, а не от его начала. */
  grabbed: number
}

type Props = {
  days: string[]
  events: CalendarEventView[]
  blocks: TimeBlockView[]
  dues: CardDueView[]
  tasks: CalendarTask[]
  onSelect: (range: Range) => void
  onOpen: (event: CalendarEventView) => void
  onOpenTask: (task: CalendarTask) => void
}

/**
 * Событие и тайм-блок раскладываются одним проходом: делить ширину они должны между
 * собой, а не каждый со своими. Идентификатор блока разведён приставкой — ключ раскладки
 * растёт из него, а совпасть с событием он вполне может.
 */
type GridItem =
  | { id: string; startsAt: string; endsAt: string; kind: 'event'; event: TimedView }
  | { id: string; startsAt: string; endsAt: string; kind: 'block'; block: TimeBlockView }

function gridItems(events: TimedView[], blocks: TimeBlockView[]): GridItem[] {
  return [
    ...events.map(
      (event): GridItem => ({
        id: event.id,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        kind: 'event',
        event,
      }),
    ),
    ...blocks.map(
      (block): GridItem => ({
        id: `block:${block.id}`,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        kind: 'block',
        block,
      }),
    ),
  ]
}

/** Точка курсора в конце жеста dnd-kit: с клавиатуры её нет, и бросок на сетку не считается. */
function pointerOf(activator: Event, delta: { x: number; y: number }): { x: number; y: number } | null {
  if (!(activator instanceof MouseEvent)) return null
  return { x: activator.clientX + delta.x, y: activator.clientY + delta.y }
}

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
  // на сервере момента нет: отрисуй его там — и разметка разойдётся с браузерной
  const [now, setNow] = useState<Date | null>(null)
  const scroll = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const [drag, setDrag] = useState<Drag | null>(null)
  /**
   * Отрезок, записанный в Google, но ещё не приехавший обратно: пока идёт запрос, блок
   * держится на новом месте. Иначе событие прыгало бы назад на время похода в сеть.
   */
  const [pending, setPending] = useState<{ id: string; range: Range } | null>(null)
  const setTimes = useSetEventTimes()
  const createBlock = useCreateTimeBlock()

  /** Карточка, которую держат над сеткой: под курсором её ждёт заготовка тайм-блока. */
  const [dropping, setDropping] = useState<{ title: string; range: Range } | null>(null)
  const columnNodes = useRef(new Map<string, HTMLElement>())
  const grid = useDroppable({ id: CALENDAR_DROP, data: { type: CALENDAR_DROP } })

  /**
   * Куда попадёт брошенная карточка. День берётся перебором колонок по месту курсора, а не
   * у dnd-kit: цель у сетки одна на все колонки, а колонок то одна, то семь.
   */
  function dropOf(drag: DragMoveEvent | DragEndEvent) {
    const data = drag.active.data.current as DragData | undefined
    if (data?.type !== 'card' || !isCalendarDrop(drag.over?.data.current)) return null

    const point = pointerOf(drag.activatorEvent, drag.delta)
    if (!point) return null

    for (const [day, column] of columnNodes.current) {
      const box = column.getBoundingClientRect()
      if (point.x < box.left || point.x >= box.right) continue
      return { card: data.card, range: blockAt(day, snapMinutes(point.y - box.top, box.height)) }
    }
    return null
  }

  useDndMonitor({
    onDragMove: (drag) => {
      const target = dropOf(drag)
      setDropping(target && { title: target.card.title, range: target.range })
    },
    onDragEnd: (drag) => {
      const target = dropOf(drag)
      setDropping(null)
      if (!target) return

      const times = rangeTimes(target.range)
      createBlock.mutate({
        cardId: target.card.id,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
      })
    },
    onDragCancel: () => setDropping(null),
  })

  const line = now ? nowOffset(days, now) : null
  // события на весь день во временную сетку не попадают: они полосой сверху, инвариант 3
  const timed = events.filter(isTimed)
  const allDay = placeAllDay(events.filter(isAllDay), days)
  // срок и задача — не события и не отрезки времени: своя полоса под событиями на весь день
  const stripes = placeStripe(stripeItems(dues, tasks), days)

  const held = drag ?? pending
  const heldId = held?.id ?? null
  // блок, который тащат, рисуется заготовкой: на прежнем месте его быть не должно
  const shown = heldId === null ? timed : timed.filter((event) => event.id !== heldId)
  const items = gridItems(shown, blocks)

  const scrolled = useRef(false)
  useEffect(() => {
    const box = scroll.current
    if (!box || scrolled.current || now === null) return

    scrolled.current = true
    const minutes = nowOffset(days, now)?.minutes ?? 9 * 60
    box.scrollTop = (minutes / MINUTES_IN_DAY) * DAY_PX - box.clientHeight * SCROLL_ANCHOR
  }, [days, now])

  function grab(event: React.PointerEvent, kind: DragKind, base: Range, id: string | null) {
    if (event.button !== 0) return
    const column = event.currentTarget.closest<HTMLElement>('[data-day]')
    if (!column) return

    event.preventDefault()
    column.setPointerCapture(event.pointerId)
    const grabbed = minutesIn(column, event.clientY)
    const range = kind === 'select' ? selection(base.day, grabbed, grabbed) : base
    setDrag({ kind, id, base, range, grabbed })
  }

  /**
   * Отрезок считается от точки, за которую взялись, а не от прошлого шага: движение, не
   * поспевшее за отрисовкой, ничего не сдвигает лишний раз.
   */
  function advance(event: React.PointerEvent) {
    const column = event.currentTarget as HTMLElement
    if (!drag || !column.hasPointerCapture(event.pointerId)) return

    const minutes = minutesIn(column, event.clientY)
    if (drag.kind === 'select') {
      setDrag({ ...drag, range: selection(drag.base.day, drag.grabbed, minutes) })
      return
    }
    if (drag.kind === 'move') {
      const day = dayUnder(event.clientX, event.clientY) ?? drag.range.day
      setDrag({ ...drag, range: moved(drag.base, day, minutes - drag.grabbed) })
      return
    }
    setDrag({ ...drag, range: resized(drag.base, drag.kind, minutes) })
  }

  function finish() {
    const current = drag
    setDrag(null)
    if (!current) return

    if (current.kind === 'select') {
      onSelect(current.range)
      return
    }
    if (!current.id) return

    // блок отпустили там же, где взяли: это щелчок по событию, а не правка времени
    if (sameRange(current.range, current.base)) {
      const clicked = timed.find((one) => one.id === current.id)
      if (clicked) onOpen(clicked)
      return
    }

    setPending({ id: current.id, range: current.range })
    setTimes.mutate(
      { id: current.id, times: rangeTimes(current.range) },
      { onSettled: () => setPending(null) },
    )
  }

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

      {allDay.length > 0 ? (
        <div
          className="flex shrink-0 overflow-y-auto border-b border-hair px-3"
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
              <AllDayStripe key={placed.key} placed={placed} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ) : null}

      {stripes.length > 0 ? (
        <div
          className="flex shrink-0 overflow-y-auto border-b border-hair px-3"
          style={{ maxHeight: STRIPE_MAX_PX }}
        >
          <div className={RAIL} />
          <div
            className="grid flex-1 gap-px py-px"
            style={{
              gridTemplateColumns: columns(days.length),
              gridAutoRows: `${STRIPE_PX}px`,
            }}
          >
            {stripes.map((placed) =>
              placed.item.kind === 'due' ? (
                <DueStripe
                  key={`due:${placed.item.due.id}`}
                  placed={placed}
                  due={placed.item.due}
                  now={now}
                />
              ) : (
                <TaskStripe
                  key={`task:${placed.item.task.id}`}
                  placed={placed}
                  task={placed.item.task}
                  onOpen={onOpenTask}
                />
              ),
            )}
          </div>
        </div>
      ) : null}

      <Failure error={setTimes.error ?? createBlock.error} className="px-3 pt-1" />

      <div
        ref={(node) => {
          scroll.current = node
          grid.setNodeRef(node)
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3"
      >
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
            {days.map((day) => (
              <div
                key={day}
                data-day={day}
                ref={(node) => {
                  if (node) columnNodes.current.set(day, node)
                  else columnNodes.current.delete(day)
                }}
                onPointerDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  grab(event, 'select', { day, start: 0, end: 0 }, null)
                }}
                onPointerMove={advance}
                onPointerUp={finish}
                onPointerCancel={() => setDrag(null)}
                className={`relative border-l border-white/5 select-none first:border-l-0 ${
                  isToday(day, now ?? undefined) ? 'bg-white/4' : ''
                }`}
                style={{ backgroundImage: HOUR_LINES }}
              >
                {placeDay(items, day).map((placed) =>
                  placed.event.kind === 'event' ? (
                    <EventBlock
                      key={placed.key}
                      placed={{ ...placed, event: placed.event.event }}
                      day={day}
                      onGrab={grab}
                      onOpen={onOpen}
                    />
                  ) : (
                    <TimeBlockChip
                      key={placed.key}
                      placed={{ ...placed, event: placed.event.block }}
                    />
                  ),
                )}
                {held && held.range.day === day ? (
                  <Draft range={held.range} event={timed.find((one) => one.id === heldId) ?? null} />
                ) : null}
                {dropping?.range.day === day ? (
                  <Draft range={dropping.range} event={null} title={dropping.title} />
                ) : null}
                {line?.date === day ? <NowLine minutes={line.minutes} /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Минута сетки под курсором. Колонки одной высоты, поэтому годится любая из них. */
function minutesIn(column: HTMLElement, clientY: number): number {
  const box = column.getBoundingClientRect()
  return snapMinutes(clientY - box.top, box.height)
}

/** День колонки под курсором: в недельном виде блок переезжает вбок тем же движением. */
function dayUnder(clientX: number, clientY: number): string | null {
  const found = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-day]')
  return found?.dataset.day ?? null
}

type TimedView = CalendarEventView & { startsAt: string; endsAt: string }

function isTimed(event: CalendarEventView): event is TimedView {
  return !event.allDay && event.startsAt !== null && event.endsAt !== null
}

type AllDayView = CalendarEventView & { startDate: string; endDate: string }

function isAllDay(event: CalendarEventView): event is AllDayView {
  return event.allDay && event.startDate !== null && event.endDate !== null
}

type OpenHandler = (event: CalendarEventView) => void

/**
 * Экземпляр повторяющегося события. Серию целиком мы не правим (ADR-004), поэтому на блоке
 * это должно читаться до того, как его открыли.
 */
function RepeatMark() {
  return (
    <span aria-hidden className="shrink-0 font-mono text-[9.5px] leading-none text-white/75">
      ↻
    </span>
  )
}

function hintOf(event: CalendarEventView, title: string): string {
  return event.recurringEventId ? `${title} (повторяется)` : title
}

function AllDayStripe({
  placed,
  onOpen,
}: {
  placed: PlacedAllDay<AllDayView>
  onOpen: OpenHandler
}) {
  const { event, index, span, lane, clippedStart, clippedEnd } = placed
  const title = event.title ?? 'Без названия'

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={`overflow-hidden rounded-lg px-1.5 text-left text-[10px] leading-[15px] font-medium text-fog outline-none transition-[filter] hover:brightness-110 focus-visible:ring-1 focus-visible:ring-accent-line ${
        clippedStart ? 'rounded-l-none' : ''
      } ${clippedEnd ? 'rounded-r-none' : ''}`}
      style={{
        gridColumn: `${index + 1} / span ${span}`,
        gridRow: lane + 1,
        border: `1px solid ${event.color}66`,
        background: `linear-gradient(135deg, ${event.color}8c, ${event.color}52)`,
      }}
      title={hintOf(event, title)}
    >
      <span className="flex items-center gap-1">
        {event.recurringEventId ? <RepeatMark /> : null}
        <span className="truncate">{title}</span>
      </span>
    </button>
  )
}

/** Место в полосе: сроку и задаче от раскладки нужны только клетка дня и ряд в ней. */
type StripePlace = PlacedStripe<StripeEntry<CardDueView, CalendarTask>>

/**
 * Срок карточки. Событие — заливка цветом календаря, срок — пунктирный контур без
 * заливки: с одного взгляда видно, что это не встреча, а граница работы.
 *
 * Ссылка обычная, не `next/link`: карточку открывает страница стола, подставляя её доску
 * в слот, и делает это на серверной отрисовке. Мягкий переход состояние стола не
 * пересобирает, и карточка чужой доски осталась бы неоткрытой.
 */
function DueStripe({
  placed,
  due,
  now,
}: {
  placed: StripePlace
  due: CardDueView
  now: Date | null
}) {
  const overdue = now !== null && isOverdue(due.dueAt, due.dueDone, due.dueHasTime, now.getTime())
  const time = due.dueHasTime ? moscowParts(due.dueAt).time : null

  return (
    <a
      href={`/?card=${due.id}`}
      title={`Срок${time ? ` ${time}` : ''}: ${due.title} — ${due.boardTitle}`}
      className={`flex items-center gap-1 overflow-hidden rounded-lg border border-dashed px-1.5 text-[10px] leading-[12px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent-line ${
        overdue
          ? 'border-alarm-line text-alarm hover:bg-alarm-wash'
          : due.dueDone
            ? 'border-hair text-fog-faint line-through hover:bg-white/6'
            : 'border-hair-lit text-fog-muted hover:bg-white/6'
      }`}
      style={{ gridColumn: placed.index + 1, gridRow: placed.lane + 1 }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rotate-45 border border-current" />
      {time ? <span className="shrink-0 font-mono tabular-nums">{time}</span> : null}
      <span className="truncate">{due.title}</span>
    </a>
  )
}

/**
 * Задача Google. Четвёртая сущность на сетке, и различается она тем же, чем и остальные,
 * — материалом, а не цветом (ADR-011): сплошной контур цветом аккаунта и квадратный
 * чекбокс слева. У события заливка, у срока пунктир с ромбом, у блока штриховка.
 *
 * Чекбокс и название — две кнопки рядом, а не кнопка внутри кнопки: клик по квадрату
 * закрывает задачу, клик по названию открывает панель.
 */
function TaskStripe({
  placed,
  task,
  onOpen,
}: {
  placed: StripePlace
  task: CalendarTask
  onOpen: (task: CalendarTask) => void
}) {
  const setDone = useSetTaskDone()
  const title = task.title ?? 'Без названия'
  // отметка ходит в Google и приезжает обратно синхронизацией: пока идёт, показываем свою
  const done = setDone.isPending ? !task.completed : task.completed

  return (
    <div
      className={`flex items-center gap-1 overflow-hidden rounded-lg border px-1 text-[10px] leading-[12px] transition-colors ${
        done ? 'text-fog-faint line-through' : 'text-fog-muted'
      }`}
      style={{
        gridColumn: placed.index + 1,
        gridRow: placed.lane + 1,
        borderColor: done ? undefined : `${task.color}80`,
      }}
    >
      <button
        type="button"
        aria-label={done ? `Снять отметку: ${title}` : `Выполнить: ${title}`}
        aria-pressed={done}
        disabled={setDone.isPending}
        onClick={() => setDone.mutate({ id: task.id, completed: !task.completed })}
        className="grid size-2.5 shrink-0 place-items-center rounded-[3px] border text-[8px] leading-none outline-none transition-colors hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent-line"
        style={{ borderColor: done ? undefined : task.color }}
      >
        {done ? <span aria-hidden>✓</span> : null}
      </button>
      <button
        type="button"
        onClick={() => onOpen(task)}
        title={`Задача: ${title}`}
        className="min-w-0 flex-1 truncate text-left outline-none transition-colors hover:text-fog focus-visible:ring-1 focus-visible:ring-accent-line"
      >
        {title}
      </button>
    </div>
  )
}

/**
 * Время, отведённое под карточку. Третья сущность на сетке, и различаются они материалом,
 * а не цветом: событие — сплошная заливка цветом своего календаря, срок — пунктирный
 * контур с ромбом, блок — штриховка с полосой слева и квадратной меткой. Цвет календаря
 * приходит из Google и может совпасть с акцентом, форма — нет.
 *
 * Своего названия у блока нет — он показывает карточку и в неё же ведёт, как и полоса срока.
 */
function TimeBlockChip({ placed }: { placed: PlacedEvent<TimeBlockView> }) {
  const { event: block, start, end, column, columns } = placed
  const height = ((end - start) / MINUTES_IN_DAY) * DAY_PX
  const time = moscowParts(block.startsAt).time

  return (
    <div
      className="timeblock group absolute overflow-hidden"
      style={{
        top: (start / MINUTES_IN_DAY) * DAY_PX,
        height,
        left: `${(column / columns) * 100}%`,
        width: `calc(${100 / columns}% - 2px)`,
      }}
    >
      <a
        href={`/?card=${block.cardId}`}
        title={`Время под карточку ${time}${block.calendarId ? ', видно в Google' : ''}: ${block.cardTitle} — ${block.boardTitle}`}
        className="block h-full overflow-hidden px-1.5 py-0.5 text-left text-[10px] leading-tight text-fog-muted outline-none hover:bg-white/8 focus-visible:ring-1 focus-visible:ring-accent-line"
      >
        {height >= TIME_VISIBLE_PX ? (
          <span className="block truncate font-mono text-[9.5px] text-accent tabular-nums">
            {time}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          <span aria-hidden className="size-1.5 shrink-0 rounded-[1px] bg-accent" />
          <span className="truncate font-medium">{block.cardTitle}</span>
        </span>
      </a>
      <TimeBlockMenu blockId={block.id} cardTitle={block.cardTitle} calendarId={block.calendarId} />
    </div>
  )
}

type BlockProps = {
  placed: PlacedEvent<TimedView>
  day: string
  onGrab: (event: React.PointerEvent, kind: DragKind, base: Range, id: string | null) => void
  onOpen: OpenHandler
}

function EventBlock({ placed, day, onGrab, onOpen }: BlockProps) {
  const { event, start, end, column, columns } = placed
  const height = ((end - start) / MINUTES_IN_DAY) * DAY_PX
  const title = event.title ?? 'Без названия'
  const time = moscowParts(event.startsAt).time
  // кусок события, обрезанный полуночью, не тащится: правка переписала бы событие целиком
  const base = rangeOf(event, day)

  /**
   * Мышь ведёт `finish`: он один отличает щелчок от перетаскивания. Сюда доходит либо
   * клавиатура (`detail` нулевой), либо блок, который не тащится вовсе.
   */
  function open(pointer: React.MouseEvent) {
    if (pointer.detail === 0 || !base) onOpen(event)
  }

  return (
    <button
      type="button"
      onPointerDown={base ? (pointer) => onGrab(pointer, 'move', base, event.id) : undefined}
      onClick={open}
      className={`absolute overflow-hidden rounded-[11px] px-1.5 py-0.5 text-left text-[10px] leading-tight text-fog shadow-[0_6px_18px_rgb(0_0_0/0.3)] outline-none transition-[filter] hover:brightness-110 focus-visible:ring-1 focus-visible:ring-accent-line ${
        base ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{
        top: (start / MINUTES_IN_DAY) * DAY_PX,
        height,
        left: `${(column / columns) * 100}%`,
        width: `calc(${100 / columns}% - 2px)`,
        border: `1px solid ${event.color}66`,
        background: `linear-gradient(135deg, ${event.color}8c, ${event.color}52)`,
      }}
      title={hintOf(event, `${time} ${title}`)}
    >
      {height >= TIME_VISIBLE_PX ? (
        <span className="block truncate font-mono text-[9.5px] text-white/70 tabular-nums">
          {time}
        </span>
      ) : null}
      <span className="flex items-center gap-1">
        {event.recurringEventId ? <RepeatMark /> : null}
        <span className="truncate font-medium">{title}</span>
      </span>

      {base && height >= BOTH_HANDLES_PX ? (
        <Handle edge="start" onPointerDown={(pointer) => onGrab(pointer, 'start', base, event.id)} />
      ) : null}
      {base ? (
        <Handle edge="end" onPointerDown={(pointer) => onGrab(pointer, 'end', base, event.id)} />
      ) : null}
    </button>
  )
}

function Handle({
  edge,
  onPointerDown,
}: {
  edge: 'start' | 'end'
  onPointerDown: (event: React.PointerEvent) => void
}) {
  return (
    <span
      onPointerDown={(event) => {
        event.stopPropagation()
        onPointerDown(event)
      }}
      aria-hidden
      className={`absolute inset-x-0 block h-1.5 cursor-ns-resize ${edge === 'start' ? 'top-0' : 'bottom-0'}`}
    />
  )
}

/**
 * Заготовка под курсором: выделение под новое событие или блок, который тащат. Событий не
 * ловит — иначе она закрывала бы колонку, над которой её держат.
 */
function Draft({
  range,
  event,
  title,
}: {
  range: Range
  event: TimedView | null
  /** Подпись заготовки, когда события за ней нет: название брошенной карточки. */
  title?: string
}) {
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
          ? { border: `1px solid ${color}66`, background: `linear-gradient(135deg, ${color}a6, ${color}66)` }
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

function columns(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`
}

// часовая разметка фоном, а не строками: 24 пустых div на каждый день сетке не нужны
const HOUR_LINES = `repeating-linear-gradient(
  to bottom,
  rgb(255 255 255 / 0.05) 0 1px,
  transparent 1px ${HOUR_PX}px
)`
