import { MINUTES_IN_DAY } from './calendar-grid'
import { moscowParts } from './dates'

/** Событие короче этого на сетке не видно: блок растягивается вниз до читаемой высоты. */
export const MIN_EVENT_MINUTES = 20

export type TimedEvent = { id: string; startsAt: string; endsAt: string }

/** Кусок события, попавший на один день сетки. Через полночь событие даёт два куска. */
export type PlacedEvent<T> = {
  event: T
  key: string
  /** Минуты от полуночи московских суток; границы уже обрезаны днём. */
  start: number
  end: number
  /** Место в ряду пересекающихся: столбец из `columns`, по ним и делится ширина. */
  column: number
  columns: number
}

function utcOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * Минуты от полуночи дня `day` до момента. Считается по московским стенным часам, как и
 * линия текущего времени: высота суток на сетке всегда 24 часа, даже когда часы переводят.
 */
function offsetFrom(day: string, iso: string): number {
  const { date, time } = moscowParts(iso)
  const [hour, minute] = time.split(':').map(Number)
  const days = (utcOf(date) - utcOf(day)) / 86_400_000
  return days * MINUTES_IN_DAY + hour * 60 + minute
}

/**
 * Раскладка событий одного дня: обрезка суточной границей и деление ширины между
 * пересекающимися. Ряд пересечений набирается жадно — событие занимает первый столбец,
 * освободившийся к его началу, — и все события ряда получают одинаковое число столбцов,
 * иначе соседние блоки разъезжались бы по ширине внутри одной группы.
 */
export function placeDay<T extends TimedEvent>(events: readonly T[], day: string): PlacedEvent<T>[] {
  const drafts: Omit<PlacedEvent<T>, 'columns'>[] = []

  for (const event of events) {
    const from = offsetFrom(day, event.startsAt)
    const to = offsetFrom(day, event.endsAt)
    // касание границы дня попаданием в него не считается, а событие нулевой длины считается
    const shows = from < MINUTES_IN_DAY && (to > 0 || (to === from && from >= 0))
    if (!shows) continue

    const start = Math.max(from, 0)
    const bottom = Math.min(to, MINUTES_IN_DAY)
    const end = Math.min(MINUTES_IN_DAY, Math.max(bottom, start + MIN_EVENT_MINUTES))

    drafts.push({ event, key: `${event.id}:${day}`, start, end, column: 0 })
  }

  drafts.sort((a, b) => a.start - b.start || b.end - a.end || (a.key < b.key ? -1 : 1))

  const placed: PlacedEvent<T>[] = []
  let row: Omit<PlacedEvent<T>, 'columns'>[] = []
  // конец последнего события в каждом столбце ряда; их максимум и есть конец ряда
  let ends: number[] = []

  const flush = () => {
    for (const draft of row) placed.push({ ...draft, columns: ends.length })
    row = []
    ends = []
  }

  for (const draft of drafts) {
    if (ends.length > 0 && draft.start >= Math.max(...ends)) flush()

    const free = ends.findIndex((end) => end <= draft.start)
    const column = free === -1 ? ends.length : free
    ends[column] = draft.end

    row.push({ ...draft, column })
  }
  flush()

  return placed
}

export type AllDayEvent = { id: string; startDate: string; endDate: string }

/** Полоса события на весь день: сколько дней окна она занимает и в каком ряду лежит. */
export type PlacedAllDay<T> = {
  event: T
  key: string
  /** Индекс первого занятого дня в `days` и длина полосы в днях. */
  index: number
  span: number
  /** Ряд полосы: пересекающиеся события не наезжают друг на друга, а становятся ниже. */
  lane: number
  /** Событие началось раньше окна или кончается позже: полоса обрезана этим краем. */
  clippedStart: boolean
  clippedEnd: boolean
}

/**
 * Раскладка полосы событий на весь день. Даты сравниваются как даты, без всякого перевода
 * в момент: инвариант 3. `endDate` исключающая — однодневное событие приходит парой
 * `2026-09-02` / `2026-09-03` и занимает ровно один день.
 */
export function placeAllDay<T extends AllDayEvent>(
  events: readonly T[],
  days: readonly string[],
): PlacedAllDay<T>[] {
  if (days.length === 0) return []

  const first = utcOf(days[0])
  const dayOf = (date: string) => Math.round((utcOf(date) - first) / 86_400_000)

  const drafts = events.flatMap((event) => {
    const from = dayOf(event.startDate)
    const to = dayOf(event.endDate)
    if (from >= days.length || to <= 0 || to <= from) return []

    const index = Math.max(from, 0)
    return [
      {
        event,
        key: `${event.id}:${days[0]}`,
        index,
        span: Math.min(to, days.length) - index,
        clippedStart: from < 0,
        clippedEnd: to > days.length,
      },
    ]
  })

  // длинные полосы раньше коротких: иначе короткая заняла бы верхний ряд и разорвала его
  drafts.sort((a, b) => a.index - b.index || b.span - a.span || (a.key < b.key ? -1 : 1))

  // первый свободный с этого дня день в каждом ряду
  const lanes: number[] = []

  return drafts.map((draft) => {
    const free = lanes.findIndex((end) => end <= draft.index)
    const lane = free === -1 ? lanes.length : free
    lanes[lane] = draft.index + draft.span

    return { ...draft, lane }
  })
}

/** Элемент полосы под сеткой: свой день московскими стенными часами. */
export type StripeItem = { day: string }

/** Место в полосе: клетка своего дня и ряд внутри него. Ширину элемент ни с кем не делит. */
export type PlacedStripe<T> = {
  item: T
  index: number
  lane: number
}

/**
 * Раскладка полосы под сеткой: сроки карточек и задачи Google лежат в ней вперемешку.
 * Ни то, ни другое не отрезок времени: срок — граница дня, у задачи времени нет вовсе, и
 * каждый занимает одну клетку своего дня, а не место во временной сетке.
 *
 * Ряды набираются входным порядком, общим счётчиком на день: иначе задача легла бы на срок.
 */
export function placeStripe<T extends StripeItem>(
  items: readonly T[],
  days: readonly string[],
): PlacedStripe<T>[] {
  const taken = new Map<number, number>()

  return items.flatMap((item) => {
    const index = days.indexOf(item.day)
    if (index === -1) return []

    const lane = taken.get(index) ?? 0
    taken.set(index, lane + 1)
    return [{ item, index, lane }]
  })
}

export type DueItem = { dueAt: string }
/** У задачи Google срок — дата без времени: через часовой пояс она не идёт, инвариант 3. */
export type TaskItem = { due: string }

export type StripeEntry<D, T> =
  | { kind: 'due'; day: string; due: D }
  | { kind: 'task'; day: string; task: T }

/**
 * Содержимое полосы: сроки карточек и задачи Google одним списком. День срока считается
 * московскими стенными часами, тем же боком, каким срок показан на самой карточке, а
 * дата задачи берётся как есть — переводить её было бы сдвигом на сутки.
 *
 * Сроки идут перед задачами: в дне, где есть и то и другое, своя работа выше зеркала Google.
 */
export function stripeItems<D extends DueItem, T extends TaskItem>(
  dues: readonly D[],
  tasks: readonly T[],
): StripeEntry<D, T>[] {
  return [
    ...dues.map((due) => ({ kind: 'due' as const, day: moscowParts(due.dueAt).date, due })),
    ...tasks.map((task) => ({ kind: 'task' as const, day: task.due, task })),
  ]
}
