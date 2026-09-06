import type { CalendarTask } from '@/server/services/google-tasks'
import { targetKey, type Held, type Range } from './calendar-drag'
import { addDays } from './calendar-grid'
import {
  placeAllDay,
  placeStripe,
  stripeItems,
  type PlacedAllDay,
  type PlacedStripe,
  type StripeEntry,
} from './calendar-layout'
import type { CalendarEventView, CardDueView, TimeBlockView } from './calendar-view'

export type TimedView = CalendarEventView & { startsAt: string; endsAt: string }

export function isTimed(event: CalendarEventView): event is TimedView {
  return !event.allDay && event.startsAt !== null && event.endsAt !== null
}

export type AllDayView = CalendarEventView & { startDate: string; endDate: string }

export function isAllDay(event: CalendarEventView): event is AllDayView {
  return event.allDay && event.startDate !== null && event.endDate !== null
}

/**
 * Кого тащат по полосам над сеткой. Отрезка времени ни у одного из троих нет: событие на
 * весь день, срок карточки и задача Google переезжают целым днём, поэтому и движение у них
 * только вбок.
 */
export type StripeTarget =
  | { kind: 'allday'; event: AllDayView }
  | { kind: 'due'; due: CardDueView }
  | { kind: 'task'; task: CalendarTask }

/** Полоса в переносе: за какой день взялись и какой сейчас под курсором. */
export type StripeDrag = { target: StripeTarget; from: string; day: string }

const keyOf = (kind: StripeTarget['kind'], id: string) => `${kind}:${id}`

/** Ключ полосы: сроки, задачи и события на весь день нумерованы каждый по-своему. */
export function stripeKey(target: StripeTarget): string {
  if (target.kind === 'allday') return keyOf('allday', target.event.id)
  if (target.kind === 'due') return keyOf('due', target.due.id)
  return keyOf('task', target.task.id)
}

/**
 * Событие и тайм-блок раскладываются одним проходом: делить ширину они должны между
 * собой, а не каждый со своими. Идентификатор блока разведён приставкой — ключ раскладки
 * растёт из него, а совпасть с событием он вполне может.
 */
export type GridItem =
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

/**
 * Полоса, которую тащат, раскладывается по дню под курсором, а не по записанному: так она
 * встаёт в свободный ряд дня-приёмника, а не наезжает на чужую полосу.
 */
function previewAllDay(shown: AllDayView[], days: string[], held: StripeDrag[]): AllDayView[] {
  const shifts = new Map<string, number>()
  for (const one of held) {
    if (one.target.kind !== 'allday') continue
    const shift = days.indexOf(one.day) - days.indexOf(one.from)
    if (shift !== 0) shifts.set(one.target.event.id, shift)
  }
  if (shifts.size === 0) return shown

  return shown.map((event) => {
    const shift = shifts.get(event.id)
    return shift === undefined
      ? event
      : {
          ...event,
          startDate: addDays(event.startDate, shift),
          endDate: addDays(event.endDate, shift),
        }
  })
}

function previewStripes(
  items: StripeEntry<CardDueView, CalendarTask>[],
  held: StripeDrag[],
): StripeEntry<CardDueView, CalendarTask>[] {
  const moved = new Map<string, string>()
  for (const one of held) {
    if (one.target.kind !== 'allday') moved.set(stripeKey(one.target), one.day)
  }
  if (moved.size === 0) return items

  return items.map((item) => {
    const day = moved.get(keyOf(item.kind, item.kind === 'due' ? item.due.id : item.task.id))
    return day === undefined ? item : { ...item, day }
  })
}

/** Место полосы: сроку и задаче от раскладки нужны только клетка дня и ряд в ней. */
export type StripePlace = PlacedStripe<StripeEntry<CardDueView, CalendarTask>>

export type StripeScene = {
  allDay: PlacedAllDay<AllDayView>[]
  stripes: StripePlace[]
}

/**
 * Полосы над сеткой: события на весь день и ряд сроков с задачами под ними. Считаются
 * отдельно от временной сетки — жест по полосе её содержимого не касается.
 */
export function stripeScene(input: {
  days: string[]
  events: CalendarEventView[]
  dues: CardDueView[]
  tasks: CalendarTask[]
  held: StripeDrag[]
}): StripeScene {
  const { days, events, dues, tasks, held } = input

  return {
    // события на весь день во временную сетку не попадают: они полосой сверху, инвариант 3
    allDay: placeAllDay(previewAllDay(events.filter(isAllDay), days, held), days),
    // срок и задача — не события и не отрезки времени: своя полоса под событиями на весь день
    stripes: placeStripe(previewStripes(stripeItems(dues, tasks), held), days),
  }
}

/** Заготовка вместо удержанного куска: отрезок и то, что за ним стоит. */
export type GridDraft = { range: Range; event: TimedView | null; title?: string }

export type GridScene = {
  /** События со временем и тайм-блоки вперемешку: раскладка по дням идёт по ним разом. */
  items: GridItem[]
  /** Заготовки по всем удержаниям разом: с прежних мест эти куски сняты. */
  drafts: GridDraft[]
}

/**
 * Содержимое временной сетки. Функция чистая: жест приносит сюда своё состояние — то, что
 * тащат и что дописывается в Google, — и получает раскладку, уже учитывающую движение.
 */
export function gridScene(input: {
  events: CalendarEventView[]
  blocks: TimeBlockView[]
  held: Held[]
}): GridScene {
  const { events, blocks, held } = input
  const timed = events.filter(isTimed)
  const keys = new Set(held.flatMap((one) => (one.target ? [targetKey(one.target)] : [])))

  // то, что удерживают, рисуется заготовкой: на прежнем месте его быть не должно
  const items = gridItems(
    timed.filter((event) => !keys.has(targetKey({ type: 'event', id: event.id }))),
    blocks.filter((block) => !keys.has(targetKey({ type: 'block', id: block.id }))),
  )

  return {
    items,
    drafts: held.map(({ target, range }) => ({
      range,
      event: target?.type === 'event' ? (timed.find((one) => one.id === target.id) ?? null) : null,
      title:
        target?.type === 'block'
          ? blocks.find((one) => one.id === target.id)?.cardTitle
          : undefined,
    })),
  }
}
