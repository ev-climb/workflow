import { and, asc, between, eq, gt, sql } from 'drizzle-orm'
import { addDays, daysOf, moscowToday } from '../../lib/calendar-grid.ts'
import { db } from '../db/client.ts'
import { dailyResults, noteItems } from '../db/schema.ts'
import { parseDayWindow } from './day-window.ts'

/**
 * Итог дня переписывается после каждой правки списка «Сегодня»: пункт отметили, сняли,
 * добавили или удалили — день мог и закрыться, и открыться обратно.
 */
export async function recordDay(noteId: string, day: string): Promise<void> {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      done: sql<number>`count(*) filter (where ${noteItems.done} and ${noteItems.doneOn} = ${day})`.mapWith(
        Number,
      ),
    })
    .from(noteItems)
    .where(eq(noteItems.noteId, noteId))

  await db
    .insert(dailyResults)
    .values({ day, ...counts })
    .onConflictDoUpdate({ target: dailyResults.day, set: { ...counts, updatedAt: new Date() } })
}

/** Дни окна, в которые список «Сегодня» закрыт целиком. Пустой список день не закрывает. */
export async function completeDays(from: string, to: string): Promise<string[]> {
  const window = parseDayWindow(from, to)

  const rows = await db
    .select({ day: dailyResults.day })
    .from(dailyResults)
    .where(
      and(
        between(dailyResults.day, window.from, window.to),
        gt(dailyResults.total, 0),
        eq(dailyResults.done, dailyResults.total),
      ),
    )
    .orderBy(asc(dailyResults.day))

  return rows.map((row) => row.day)
}

export type DayState = 'complete' | 'partial' | 'empty' | 'future'

export type DailyStats = {
  /** Сколько дней сетки закрыто целиком. */
  complete: number
  /** Недели с понедельника за последний год, последняя — текущая. */
  weeks: { day: string; state: DayState }[][]
}

const WEEKS = 53

type DayRow = { day: string; total: number; done: number }

const firstMonday = (today: string) => addDays(daysOf('week', today)[0], (1 - WEEKS) * 7)

export function summarize(rows: DayRow[], today: string): DailyStats {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const stateOf = (day: string): DayState => {
    if (day > today) return 'future'
    const row = byDay.get(day)
    if (!row || row.done === 0) return 'empty'
    return row.total > 0 && row.done === row.total ? 'complete' : 'partial'
  }

  const weeks = Array.from({ length: WEEKS }, (_, at) =>
    daysOf('week', addDays(firstMonday(today), at * 7)).map((day) => ({ day, state: stateOf(day) })),
  )
  const complete = weeks.flat().filter((cell) => cell.state === 'complete').length

  return { complete, weeks }
}

export async function dailyStats(today: string = moscowToday()): Promise<DailyStats> {
  const rows = await db
    .select({ day: dailyResults.day, total: dailyResults.total, done: dailyResults.done })
    .from(dailyResults)
    .where(between(dailyResults.day, firstMonday(today), today))

  return summarize(rows, today)
}
