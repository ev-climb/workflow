'use client'

import { useRouter } from 'next/navigation'
import type { PlacedAllDay } from '@/lib/calendar-layout'
import { useSetTaskDone } from '@/lib/calendar-mutations'
import type { AllDayView, StripePlace, StripeTarget } from '@/lib/calendar-scene'
import type { CardDueView } from '@/lib/calendar-view'
import { isOverdue, moscowParts } from '@/lib/dates'
import type { CalendarTask } from '@/server/services/google-tasks'
import { RAIL, cardHref, columns, type OpenHandler, type TaskOpenHandler } from './grid'
import { RepeatMark, hintOf } from './RepeatMark'
import type { Grip } from './use-stripe-drag'

const ALL_DAY_PX = 16
/** Выше полоса не растёт, а прокручивается: сетка со временем важнее списка дат. */
const ALL_DAY_MAX_PX = ALL_DAY_PX * 4

const STRIPE_PX = 14
const STRIPE_MAX_PX = STRIPE_PX * 4

const ROW = 'flex shrink-0 overflow-y-auto border-b border-hair px-3'
const CELLS = 'grid flex-1 gap-px py-px select-none'

/** Ряд событий на весь день над сеткой. */
export function AllDayRow({
  placed,
  days,
  grip,
  onOpen,
}: {
  placed: PlacedAllDay<AllDayView>[]
  days: number
  grip: (target: StripeTarget) => Grip
  onOpen: OpenHandler
}) {
  if (placed.length === 0) return null

  return (
    <div className={ROW} style={{ maxHeight: ALL_DAY_MAX_PX }}>
      <div className={RAIL} />
      <div
        data-day-cells
        className={CELLS}
        style={{ gridTemplateColumns: columns(days), gridAutoRows: `${ALL_DAY_PX}px` }}
      >
        {placed.map((one) => (
          <AllDayStripe
            key={one.key}
            placed={one}
            grip={grip({ kind: 'allday', event: one.event })}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

/** Ряд сроков и задач: не события и не отрезки времени, поэтому и полоса своя. */
export function StripeRow({
  placed,
  days,
  now,
  grip,
  onOpenTask,
}: {
  placed: StripePlace[]
  days: number
  now: Date | null
  grip: (target: StripeTarget) => Grip
  onOpenTask: TaskOpenHandler
}) {
  if (placed.length === 0) return null

  return (
    <div className={ROW} style={{ maxHeight: STRIPE_MAX_PX }}>
      <div className={RAIL} />
      <div
        data-day-cells
        className={CELLS}
        style={{ gridTemplateColumns: columns(days), gridAutoRows: `${STRIPE_PX}px` }}
      >
        {placed.map((one) =>
          one.item.kind === 'due' ? (
            <DueStripe
              key={`due:${one.item.due.id}`}
              placed={one}
              due={one.item.due}
              now={now}
              grip={grip({ kind: 'due', due: one.item.due })}
            />
          ) : (
            <TaskStripe
              key={`task:${one.item.task.id}`}
              placed={one}
              task={one.item.task}
              grip={grip({ kind: 'task', task: one.item.task })}
              onOpen={onOpenTask}
            />
          ),
        )}
      </div>
    </div>
  )
}

function AllDayStripe({
  placed,
  grip,
  onOpen,
}: {
  placed: PlacedAllDay<AllDayView>
  grip: Grip
  onOpen: OpenHandler
}) {
  const { event, index, span, lane, clippedStart, clippedEnd } = placed
  const title = event.title ?? 'Без названия'

  return (
    <button
      type="button"
      {...grip}
      // мышь ведёт жест полос: он один отличает щелчок от переноса. Сюда доходит клавиатура
      onClick={(pointer) => {
        if (pointer.detail === 0) onOpen(event)
      }}
      className={`cursor-grab overflow-hidden rounded-lg px-1.5 text-left text-[10px] leading-[15px] font-medium text-fog outline-none transition-[filter] hover:brightness-110 focus-visible:ring-1 focus-visible:ring-accent-line active:cursor-grabbing ${
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

/**
 * Срок карточки. Событие — заливка цветом календаря, срок — пунктирный контур без
 * заливки: с одного взгляда видно, что это не встреча, а граница работы.
 *
 * Адрес карточки стоит настоящим `href` ради средней кнопки, но щелчок ведём сами: доску
 * под карточку подставляет серверная отрисовка стола, и мягкого перехода для этого хватает.
 */
function DueStripe({
  placed,
  due,
  now,
  grip,
}: {
  placed: StripePlace
  due: CardDueView
  now: Date | null
  grip: Grip
}) {
  const router = useRouter()
  const overdue = now !== null && isOverdue(due.dueAt, due.dueDone, due.dueHasTime, now.getTime())
  const time = due.dueHasTime ? moscowParts(due.dueAt).time : null

  return (
    <a
      href={cardHref(due.id)}
      draggable={false}
      {...grip}
      onClick={(pointer) => {
        // мышь ведёт жест полос: он один отличает щелчок от переноса
        pointer.preventDefault()
        if (pointer.detail === 0) router.push(cardHref(due.id))
      }}
      title={`Срок${time ? ` ${time}` : ''}: ${due.title} — ${due.boardTitle}`}
      className={`flex cursor-grab items-center gap-1 overflow-hidden rounded-lg border border-dashed px-1.5 text-[10px] leading-[12px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent-line active:cursor-grabbing ${
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
  grip,
  onOpen,
}: {
  placed: StripePlace
  task: CalendarTask
  grip: Grip
  onOpen: TaskOpenHandler
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
        {...grip}
        // мышь ведёт жест полос: он один отличает щелчок от переноса. Сюда доходит клавиатура
        onClick={(pointer) => {
          if (pointer.detail === 0) onOpen(task)
        }}
        title={`Задача: ${title}`}
        className="min-w-0 flex-1 cursor-grab truncate text-left outline-none transition-colors hover:text-fog focus-visible:ring-1 focus-visible:ring-accent-line active:cursor-grabbing"
      >
        {title}
      </button>
    </div>
  )
}
