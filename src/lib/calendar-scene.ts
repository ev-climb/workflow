import type { CalendarTask } from '@/server/services/google-tasks'
import type { Target } from './calendar-drag'
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

function holds(target: Target | null, type: Target['type'], id: string): boolean {
  return target?.type === type && target.id === id
}

/**
 * Полоса, которую тащат, раскладывается по дню под курсором, а не по записанному: так она
 * встаёт в свободный ряд дня-приёмника, а не наезжает на чужую полосу.
 */
function previewAllDay(
  shown: AllDayView[],
  days: string[],
  held: StripeDrag | null,
): AllDayView[] {
  if (held === null || held.target.kind !== 'allday') return shown

  const moving = held.target.event.id
  const shift = days.indexOf(held.day) - days.indexOf(held.from)
  if (shift === 0) return shown

  return shown.map((event) =>
    event.id === moving
      ? {
          ...event,
          startDate: addDays(event.startDate, shift),
          endDate: addDays(event.endDate, shift),
        }
      : event,
  )
}

function previewStripes(
  items: StripeEntry<CardDueView, CalendarTask>[],
  held: StripeDrag | null,
): StripeEntry<CardDueView, CalendarTask>[] {
  if (held === null || held.target.kind === 'allday') return items

  const kind = held.target.kind
  const moving = held.target.kind === 'due' ? held.target.due.id : held.target.task.id
  const day = held.day

  return items.map((item) =>
    item.kind === kind && (item.kind === 'due' ? item.due.id : item.task.id) === moving
      ? { ...item, day }
      : item,
  )
}

/** Место полосы: сроку и задаче от раскладки нужны только клетка дня и ряд в ней. */
export type StripePlace = PlacedStripe<StripeEntry<CardDueView, CalendarTask>>

export type Scene = {
  allDay: PlacedAllDay<AllDayView>[]
  stripes: StripePlace[]
  /** События со временем и тайм-блоки вперемешку: раскладка по дням идёт по ним разом. */
  items: GridItem[]
  /** Что тащат прямо сейчас: заготовка рисуется по нему, а с прежнего места оно снято. */
  heldEvent: TimedView | null
  heldBlock: TimeBlockView | null
}

/**
 * Всё, что рисует сетка, из того, что ей пришло. Функция чистая: жесты приносят сюда своё
 * состояние — то, что тащат, — и получают раскладку, уже учитывающую движение.
 */
export function buildScene(input: {
  days: string[]
  events: CalendarEventView[]
  blocks: TimeBlockView[]
  dues: CardDueView[]
  tasks: CalendarTask[]
  held: Target | null
  heldStripe: StripeDrag | null
}): Scene {
  const { days, events, blocks, dues, tasks, held, heldStripe } = input

  // события на весь день во временную сетку не попадают: они полосой сверху, инвариант 3
  const timed = events.filter(isTimed)
  const allDay = placeAllDay(previewAllDay(events.filter(isAllDay), days, heldStripe), days)
  // срок и задача — не события и не отрезки времени: своя полоса под событиями на весь день
  const stripes = placeStripe(previewStripes(stripeItems(dues, tasks), heldStripe), days)

  // то, что тащат, рисуется заготовкой: на прежнем месте его быть не должно
  const shown = timed.filter((event) => !holds(held, 'event', event.id))
  const items = gridItems(
    shown,
    blocks.filter((block) => !holds(held, 'block', block.id)),
  )

  return {
    allDay,
    stripes,
    items,
    heldEvent: held?.type === 'event' ? (timed.find((one) => one.id === held.id) ?? null) : null,
    heldBlock: held?.type === 'block' ? (blocks.find((one) => one.id === held.id) ?? null) : null,
  }
}
