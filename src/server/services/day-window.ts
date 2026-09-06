import { addDays } from '../../lib/calendar-grid.ts'
import { isDay, momentInMoscow } from '../../lib/dates.ts'
import { InvalidInputError } from './errors.ts'

export type DayWindow = {
  from: string
  to: string
  /** День за последним: сами границы включительные, а в запрос идёт исключающая правая. */
  after: string
  start: Date
  end: Date
}

/**
 * Окно дат для выдач сетки: обе границы включительные. Даты остаются строками, а в моменты
 * московской полуночи переводится только то, что сравнивается с timestamptz — инвариант 3.
 * Разойдись копии этой проверки, окна в разных частях приложения стали бы разной ширины.
 */
export function parseDayWindow(from: string, to: string, what = 'окна'): DayWindow {
  if (!isDay(from) || !isDay(to)) {
    throw new InvalidInputError(`границы ${what} — даты вида 2026-09-02`)
  }
  if (to < from) throw new InvalidInputError('окно кончается не раньше, чем начинается')

  const after = addDays(to, 1)
  return {
    from,
    to,
    after,
    start: momentInMoscow(from, '00:00'),
    end: momentInMoscow(after, '00:00'),
  }
}
