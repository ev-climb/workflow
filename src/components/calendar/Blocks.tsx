'use client'

import { useSetCardDueDone } from '@/lib/board-mutations'
import { placedRange, placedTime, type Range, type Target } from '@/lib/calendar-drag'
import { MINUTES_IN_DAY } from '@/lib/calendar-grid'
import type { PlacedEvent } from '@/lib/calendar-layout'
import { useSetTaskDone } from '@/lib/calendar-mutations'
import type { TimedView } from '@/lib/calendar-scene'
import type { TimeBlockView } from '@/lib/calendar-view'
import {
  BOTH_HANDLES_PX,
  DAY_PX,
  TIME_VISIBLE_PX,
  cardHref,
  type OpenHandler,
  type TaskOpenHandler,
} from './grid'
import { RepeatMark, hintOf } from './RepeatMark'
import { TimeBlockMenu } from './TimeBlockMenu'
import type { GrabHandler } from './use-grid-drag'

/** Место блока в колонке дня: сверху вниз по минутам, вширь — доля от соседей. */
function box(placed: PlacedEvent<unknown>): React.CSSProperties {
  const { start, end, column, columns } = placed
  return {
    top: (start / MINUTES_IN_DAY) * DAY_PX,
    height: ((end - start) / MINUTES_IN_DAY) * DAY_PX,
    left: `${(column / columns) * 100}%`,
    width: `calc(${100 / columns}% - 2px)`,
  }
}

const heightOf = (placed: PlacedEvent<unknown>) =>
  ((placed.end - placed.start) / MINUTES_IN_DAY) * DAY_PX

/**
 * Время, отведённое под карточку. Третья сущность на сетке, и различаются они материалом,
 * а не цветом: событие — сплошная заливка цветом своего календаря, срок — пунктирный
 * контур с ромбом, блок — штриховка с полосой слева и квадратным чекбоксом. Цвет календаря
 * приходит из Google и может совпасть с акцентом, форма — нет.
 *
 * Своего названия у блока нет — он показывает карточку и в неё же ведёт, как и полоса срока.
 * Время у блока правится тем же движением, что и у события: тащим за середину, тянем за края.
 *
 * Чекбокс и ссылка — соседи, а не кнопка внутри ссылки, как и у задач Google: щелчок по
 * квадрату закрывает карточку, щелчок по названию открывает её.
 */
export function TimeBlockChip({
  placed,
  day,
  onGrab,
}: {
  placed: PlacedEvent<TimeBlockView>
  day: string
  onGrab: GrabHandler
}) {
  const block = placed.event
  const setDone = useSetCardDueDone(block.boardId, block.cardId)
  const height = heightOf(placed)
  const time = placedTime(placed)
  // доска перечитывается целиком, задержка видна глазом: пока пишем, показываем свою отметку
  const done = setDone.isPending ? !block.cardDone : block.cardDone
  // кусок блока, обрезанный полуночью, не тащится: правка переписала бы блок целиком
  const base = placedRange(day, placed)
  const target: Target = { type: 'block', id: block.id }

  return (
    <div
      className="timeblock group absolute flex items-start gap-1 overflow-hidden px-1.5 py-0.5"
      style={{ ...box(placed), opacity: done ? 0.5 : undefined }}
    >
      <button
        type="button"
        aria-label={done ? `Снять отметку: ${block.cardTitle}` : `Выполнить: ${block.cardTitle}`}
        aria-pressed={done}
        disabled={setDone.isPending}
        onClick={() => setDone.mutate(!block.cardDone)}
        // квадрат в 10px мышью не поймать: невидимая рамка вокруг него расширяет цель нажатия
        className={`relative mt-0.5 grid size-2.5 shrink-0 cursor-default place-items-center rounded-[3px] border text-[8px] leading-none outline-none transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-white/20 focus-visible:ring-1 focus-visible:ring-accent-line ${
          done ? 'border-done text-done' : 'border-accent text-accent'
        }`}
      >
        {done ? <span aria-hidden>✓</span> : null}
      </button>
      <a
        href={cardHref(block.cardId)}
        draggable={false}
        onPointerDown={base ? (pointer) => onGrab(pointer, 'move', base, target) : undefined}
        onClick={(pointer) => {
          // мышь ведёт `finish`: он один отличает щелчок от переноса. Клавиатуре ссылка остаётся
          if (base && pointer.detail !== 0) pointer.preventDefault()
        }}
        title={`Время под карточку ${time}${block.calendarId ? ', видно в Google' : ''}: ${block.cardTitle} — ${block.boardTitle}`}
        className={`block h-full min-w-0 flex-1 overflow-hidden text-left text-[10px] leading-tight text-fog-muted outline-none focus-visible:ring-1 focus-visible:ring-accent-line ${
          base ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        {height >= TIME_VISIBLE_PX ? (
          <span className="block truncate font-mono text-[9.5px] text-accent tabular-nums">
            {time}
          </span>
        ) : null}
        <span className={`block truncate font-medium ${done ? 'text-fog-faint line-through' : ''}`}>
          {block.cardTitle}
        </span>
      </a>

      <Handles base={base} height={height} target={target} onGrab={onGrab} />

      <TimeBlockMenu blockId={block.id} cardTitle={block.cardTitle} calendarId={block.calendarId} />
    </div>
  )
}

/**
 * Зеркало задачи Google на сетке: задаче, которой в Google выставили время, календарь
 * заводит парное событие, и приезжает оно к нам обычным событием (ADR-013). Править его
 * бесполезно — Google сам пишет в описании, что правка не сохранится, — поэтому блок не
 * тащится и не растягивается, а чекбокс закрывает задачу, стоящую за ним.
 *
 * Чекбокс и название — две кнопки рядом, а не кнопка внутри кнопки, как и в полосе задач.
 */
export function TaskBlock({
  placed,
  taskId,
  onOpen,
}: {
  placed: PlacedEvent<TimedView>
  taskId: string
  onOpen: TaskOpenHandler
}) {
  const { event } = placed
  const setDone = useSetTaskDone()
  const height = heightOf(placed)
  const title = event.title ?? 'Без названия'
  const time = placedTime(placed)
  // отметка ходит в Google и приезжает обратно синхронизацией: пока идёт, показываем свою
  const done = setDone.isPending ? event.taskCompleted !== true : event.taskCompleted === true

  return (
    <div
      className="absolute flex items-start gap-1 overflow-hidden rounded-[11px] px-1.5 py-0.5 text-[10px] leading-tight shadow-[0_6px_18px_rgb(0_0_0/0.3)]"
      style={{
        ...box(placed),
        border: `1px solid ${event.color}66`,
        background: `linear-gradient(135deg, ${event.color}8c, ${event.color}52)`,
        opacity: done ? 0.55 : undefined,
      }}
    >
      <button
        type="button"
        aria-label={done ? `Снять отметку: ${title}` : `Выполнить: ${title}`}
        aria-pressed={done}
        disabled={setDone.isPending}
        onClick={() => setDone.mutate({ id: taskId, completed: event.taskCompleted !== true })}
        className="mt-0.5 grid size-2.5 shrink-0 place-items-center rounded-[3px] border border-white/60 text-[8px] leading-none text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-1 focus-visible:ring-accent-line"
      >
        {done ? <span aria-hidden>✓</span> : null}
      </button>
      <button
        type="button"
        onClick={() => onOpen({ id: taskId, title: event.title })}
        title={`Задача: ${time} ${title}`}
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-accent-line"
      >
        {height >= TIME_VISIBLE_PX ? (
          <span className="block truncate font-mono text-[9.5px] text-white/70 tabular-nums">
            {time}
          </span>
        ) : null}
        <span
          className={`block truncate font-medium ${done ? 'text-fog-faint line-through' : 'text-fog'}`}
        >
          {title}
        </span>
      </button>
    </div>
  )
}

export function EventBlock({
  placed,
  day,
  onGrab,
  onOpen,
}: {
  placed: PlacedEvent<TimedView>
  day: string
  onGrab: GrabHandler
  onOpen: OpenHandler
}) {
  const { event } = placed
  const height = heightOf(placed)
  const title = event.title ?? 'Без названия'
  const time = placedTime(placed)
  // кусок события, обрезанный полуночью, не тащится: правка переписала бы событие целиком
  const base = placedRange(day, placed)
  const target: Target = { type: 'event', id: event.id }

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
      onPointerDown={base ? (pointer) => onGrab(pointer, 'move', base, target) : undefined}
      onClick={open}
      className={`absolute overflow-hidden rounded-[11px] px-[9px] py-[3px] text-left text-[10px] leading-tight text-fog shadow-[0_6px_18px_rgb(0_0_0/0.3)] outline-none transition-[transform,box-shadow,filter] duration-300 ease-[var(--ease-glide)] hover:translate-x-[3px] hover:brightness-110 hover:shadow-[0_10px_26px_rgb(0_0_0/0.45)] focus-visible:ring-1 focus-visible:ring-accent-line motion-reduce:transition-none ${
        base ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{
        ...box(placed),
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

      <Handles base={base} height={height} target={target} onGrab={onGrab} />
    </button>
  )
}

/** Ручки растягивания. Верхняя пропадает первой: на низком блоке двум не хватает места. */
function Handles({
  base,
  height,
  target,
  onGrab,
}: {
  base: Range | null
  height: number
  target: Target
  onGrab: GrabHandler
}) {
  if (!base) return null

  return (
    <>
      {height >= BOTH_HANDLES_PX ? (
        <Handle edge="start" onPointerDown={(pointer) => onGrab(pointer, 'start', base, target)} />
      ) : null}
      <Handle edge="end" onPointerDown={(pointer) => onGrab(pointer, 'end', base, target)} />
    </>
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
