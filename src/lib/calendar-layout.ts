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
