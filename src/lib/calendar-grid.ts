import { moscowParts } from './dates.ts'

export type CalendarMode = 'day' | 'week'

export const CALENDAR_MODES = ['day', 'week'] as const

export const MINUTES_IN_DAY = 24 * 60

export const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

// день сетки — календарная дата, а не момент: арифметика идёт в UTC, где сутки всегда
// ровно 24 часа, и перевод часов не может сдвинуть её на день назад
function utcOf(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function dateOf(at: Date): string {
  return at.toISOString().slice(0, 10)
}

/** Соседняя дата. Нужна и там, где конец диапазона исключающий: следующий день после него. */
export function addDays(date: string, days: number): string {
  const at = utcOf(date)
  at.setUTCDate(at.getUTCDate() + days)
  return dateOf(at)
}

/** Сегодняшняя дата по-московски: с неё открывается сетка. */
export function moscowToday(now: Date = new Date()): string {
  return moscowParts(now.toISOString()).date
}

/** Понедельник недели, в которую попадает дата: неделя у нас начинается с него. */
function mondayOf(date: string): string {
  const weekday = utcOf(date).getUTCDay()
  return addDays(date, weekday === 0 ? -6 : 1 - weekday)
}

/** Дни, которые показывает сетка: один в дневном виде, семь в недельном. */
export function daysOf(mode: CalendarMode, anchor: string): string[] {
  if (mode === 'day') return [anchor]
  const monday = mondayOf(anchor)
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset))
}

/** Шаг листания: сутки в дневном виде, неделя в недельном. */
export function shiftAnchor(mode: CalendarMode, anchor: string, step: number): string {
  return addDays(anchor, mode === 'day' ? step : step * 7)
}

// даты сетки уже московские, поэтому форматируются как UTC: иначе пояс сдвинул бы их ещё раз
const WEEKDAY = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short' })
const DAY_MONTH = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const FULL = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function weekdayLabel(date: string): string {
  return WEEKDAY.format(utcOf(date))
}

export function dayNumber(date: string): string {
  return String(utcOf(date).getUTCDate())
}

/** Подпись над сеткой: полная дата в дневном виде, границы недели в недельном. */
export function rangeLabel(mode: CalendarMode, days: string[]): string {
  const first = days[0]
  if (mode === 'day') return FULL.format(utcOf(first))

  const last = days[days.length - 1]
  return `${DAY_MONTH.format(utcOf(first))} — ${FULL.format(utcOf(last))}`
}

export function isToday(date: string, now: Date = new Date()): boolean {
  return date === moscowToday(now)
}

/**
 * Положение линии текущего времени в минутах от полуночи, или `null`, если этот день на
 * сетке не показан. Минуты берутся с московских часов, а не из разницы моментов: сетка
 * размечена по стенным часам, и в сутках перевода часов её высота не меняется.
 */
export function nowOffset(days: string[], now: Date = new Date()): { date: string; minutes: number } | null {
  const { date, time } = moscowParts(now.toISOString())
  if (!days.includes(date)) return null

  const [hour, minute] = time.split(':').map(Number)
  return { date, minutes: hour * 60 + minute }
}

export function isCalendarMode(value: string): value is CalendarMode {
  return (CALENDAR_MODES as readonly string[]).includes(value)
}

/** Недельная сетка занимает окно целиком: семь колонок в боковую колонку не влезают. */
export function isFullScreen(mode: CalendarMode): boolean {
  return mode === 'week'
}
