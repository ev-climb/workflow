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

export type DailyPeriod = {
  /** Длина окна в днях, `null` — всё время с первого отмеченного дня. */
  days: number | null
  complete: number
  counted: number
}

export type DailyStats = {
  periods: DailyPeriod[]
  streak: { current: number; best: number }
  /** Последние недели с понедельника: сетка для глаз, а не для счёта. */
  weeks: { day: string; state: DayState }[][]
}

const PERIODS = [7, 30, 365, null] as const
const WEEKS = 5

type DayRow = { day: string; total: number; done: number }

/**
 * Счёт идёт с первого дня, когда список вообще трогали: иначе за месяц до начала учёта
 * набегали бы проваленные дни, которых не было. Сегодня считается, только если уже
 * закрыто — незаконченный день ещё не провален.
 */
export function summarize(rows: DayRow[], today: string): DailyStats {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const stateOf = (day: string): DayState => {
    if (day > today) return 'future'
    const row = byDay.get(day)
    if (!row || row.done === 0) return 'empty'
    return row.total > 0 && row.done === row.total ? 'complete' : 'partial'
  }
  const counts = (day: string) => day < today || stateOf(day) === 'complete'

  const weeks = Array.from({ length: WEEKS }, (_, at) =>
    daysOf('week', addDays(today, (at - WEEKS + 1) * 7)).map((day) => ({ day, state: stateOf(day) })),
  )

  const first = rows.find((row) => row.day <= today)?.day
  if (!first) {
    return {
      periods: PERIODS.map((days) => ({ days, complete: 0, counted: 0 })),
      streak: { current: 0, best: 0 },
      weeks,
    }
  }

  const tracked: string[] = []
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (counts(day)) tracked.push(day)
  }

  const periods = PERIODS.map((days) => {
    const start = days === null ? first : addDays(today, 1 - days)
    const inside = tracked.filter((day) => day >= start)
    return {
      days,
      complete: inside.filter((day) => stateOf(day) === 'complete').length,
      counted: inside.length,
    }
  })

  let best = 0
  let run = 0
  for (const day of tracked) {
    run = stateOf(day) === 'complete' ? run + 1 : 0
    best = Math.max(best, run)
  }

  // незакрытое сегодня серию не рвёт: она тянется со вчера, пока день не кончился
  let current = 0
  for (let at = tracked.length - 1; at >= 0 && stateOf(tracked[at]) === 'complete'; at--) {
    current++
  }

  return { periods, streak: { current, best }, weeks }
}

export async function dailyStats(today: string = moscowToday()): Promise<DailyStats> {
  const rows = await db
    .select({ day: dailyResults.day, total: dailyResults.total, done: dailyResults.done })
    .from(dailyResults)
    .orderBy(asc(dailyResults.day))

  return summarize(rows, today)
}
