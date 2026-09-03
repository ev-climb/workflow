import { MINUTES_IN_DAY, addDays } from './calendar-grid'
import { momentInMoscow, moscowParts } from './dates'

/** Шаг сетки при выделении и перетаскивании: четверть часа. */
export const SNAP_MINUTES = 15

/** Длина заготовки, если по сетке щёлкнули, а не протянули. */
export const NEW_EVENT_MINUTES = 30

/** Длина тайм-блока, заведённого броском карточки: час под работу, а не встреча на полчаса. */
export const TIME_BLOCK_MINUTES = 60

/**
 * Цель для карточки, брошенной с доски. Сетка объявлена целиком одной целью, а день и
 * минута считаются по месту курсора: колонок то одна, то семь, и на каждую свою цель
 * пришлось бы заводить по хуку.
 */
export const CALENDAR_DROP = 'calendar-grid'

export function isCalendarDrop(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { type?: unknown }).type === CALENDAR_DROP
  )
}

/** Отрезок на сетке: день и границы в минутах от его полуночи по московским часам. */
export type Range = { day: string; start: number; end: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Точка внутри колонки дня в минуты от полуночи, притянутые к шагу сетки. */
export function snapMinutes(offsetY: number, height: number): number {
  const minutes = (offsetY / height) * MINUTES_IN_DAY
  return clamp(Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES, 0, MINUTES_IN_DAY)
}

/**
 * Выделение по сетке от точки нажатия до точки под курсором. Протяжка вверх считается
 * так же, как вниз. Нажатие без протяжки — не событие нулевой длины, а заготовка на
 * полчаса: щелчок по сетке человек делает, чтобы завести событие, а не пустоту.
 */
export function selection(day: string, anchor: number, current: number): Range {
  const start = Math.min(anchor, current)
  const end = Math.max(anchor, current)
  if (end - start >= SNAP_MINUTES) return { day, start, end }

  const from = Math.min(anchor, MINUTES_IN_DAY - NEW_EVENT_MINUTES)
  return { day, start: from, end: from + NEW_EVENT_MINUTES }
}

/** Отрезок под брошенную карточку: начало притянуто к шагу сетки, за сутки блок не вылезает. */
export function blockAt(day: string, minutes: number): Range {
  const start = clamp(minutes, 0, MINUTES_IN_DAY - TIME_BLOCK_MINUTES)
  return { day, start, end: start + TIME_BLOCK_MINUTES }
}

/**
 * Перенос блока: длина сохраняется, за сутки блок не вылезает, день берётся из колонки
 * под курсором — в недельном виде событие переезжает на соседний день тем же движением.
 */
export function moved(base: Range, day: string, shift: number): Range {
  const length = base.end - base.start
  const start = clamp(base.start + shift, 0, MINUTES_IN_DAY - length)
  return { day, start, end: start + length }
}

/** Растягивание: край едет за курсором, второй стоит. Короче шага сетки событие не станет. */
export function resized(base: Range, edge: 'start' | 'end', minutes: number): Range {
  if (edge === 'start') return { ...base, start: clamp(minutes, 0, base.end - SNAP_MINUTES) }
  return { ...base, end: clamp(minutes, base.start + SNAP_MINUTES, MINUTES_IN_DAY) }
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

/**
 * Отрезок события на сетке дня. `null` — событие в этот день целиком не укладывается:
 * кусок, обрезанный полуночью, перетаскивать нельзя, правка переписала бы всё событие.
 */
export function rangeOf(event: { startsAt: string; endsAt: string }, day: string): Range | null {
  const from = moscowParts(event.startsAt)
  if (from.date !== day) return null

  const to = moscowParts(event.endsAt)
  // конец ровно в полночь принадлежит этому дню, а не следующему: это его нижняя граница
  const end =
    to.date === day
      ? minutesOf(to.time)
      : to.date === addDays(day, 1) && to.time === '00:00'
        ? MINUTES_IN_DAY
        : null
  if (end === null) return null

  return { day, start: minutesOf(from.time), end }
}

const pad = (value: number) => String(value).padStart(2, '0')

function clock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

function momentAt(day: string, minutes: number): string {
  const shift = Math.floor(minutes / MINUTES_IN_DAY)
  const rest = minutes - shift * MINUTES_IN_DAY
  return momentInMoscow(addDays(day, shift), clock(rest)).toISOString()
}

/** Отрезок сетки в пару моментов: минуты — московские стенные часы, как и вся сетка. */
export function rangeTimes(range: Range): { allDay: false; startsAt: string; endsAt: string } {
  return {
    allDay: false,
    startsAt: momentAt(range.day, range.start),
    endsAt: momentAt(range.day, range.end),
  }
}

/**
 * Отрезок сетки в пару дат события на весь день: минуты отбрасываются, берётся день
 * выделения. Граница у Google исключающая, поэтому сутки — это следующая дата.
 * Ни одной конвертации часового пояса здесь нет и быть не должно — инвариант 3.
 */
export function rangeDates(range: Range): { allDay: true; startDate: string; endDate: string } {
  return { allDay: true, startDate: range.day, endDate: addDays(range.day, 1) }
}

/** Подпись отрезка в диалоге. Полночь снизу показывается как 24:00, а не как 00:00. */
export function timeLabel(range: Range): string {
  const end = range.end === MINUTES_IN_DAY ? '24:00' : clock(range.end)
  return `${clock(range.start)} — ${end}`
}

export function sameRange(a: Range, b: Range): boolean {
  return a.day === b.day && a.start === b.start && a.end === b.end
}
