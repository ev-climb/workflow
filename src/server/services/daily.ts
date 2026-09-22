import { and, asc, between, eq, gt, lt, sql } from 'drizzle-orm'
import { addDays, daysOf, moscowToday } from '../../lib/calendar-grid.ts'
import { isDay, momentInMoscow } from '../../lib/dates.ts'
import { db } from '../db/client.ts'
import { dailyMarks, dailyResults, noteItems } from '../db/schema.ts'
import { parseDayWindow } from './day-window.ts'
import { InvalidInputError } from './errors.ts'

/** День списка «Сегодня»: по умолчанию сегодняшний, прошлый можно, будущий — нет. */
export function dailyDay(raw?: string): string {
  const today = moscowToday()
  if (raw === undefined) return today
  if (!isDay(raw)) throw new InvalidInputError('день списка — дата вида 2026-09-02')
  if (raw > today) throw new InvalidInputError('будущий день ещё не наступил, отмечать в нём нечего')
  return raw
}

/**
 * Пункты списка «Сегодня», какими они были в `day`: заведённые позже в прошлом дне не
 * показываются и не считаются, а отметка — своя у каждого дня.
 */
function dayItems(noteId: string, day: string) {
  return and(
    eq(noteItems.noteId, noteId),
    lt(noteItems.createdAt, momentInMoscow(addDays(day, 1), '00:00')),
  )
}

const markedOn = (day: string) =>
  and(eq(dailyMarks.itemId, noteItems.id), eq(dailyMarks.day, day))

export async function dailyItems(
  noteId: string,
  day: string,
  itemId?: string,
): Promise<{ id: string; title: string; done: boolean; rank: string }[]> {
  return db
    .select({
      id: noteItems.id,
      title: noteItems.title,
      done: sql<boolean>`${dailyMarks.itemId} is not null`,
      rank: noteItems.rank,
    })
    .from(noteItems)
    .leftJoin(dailyMarks, markedOn(day))
    .where(and(dayItems(noteId, day), itemId === undefined ? undefined : eq(noteItems.id, itemId)))
    .orderBy(asc(noteItems.rank))
}

export async function markDay(itemId: string, day: string, done: boolean): Promise<void> {
  if (done) {
    await db.insert(dailyMarks).values({ itemId, day }).onConflictDoNothing()
  } else {
    await db
      .delete(dailyMarks)
      .where(and(eq(dailyMarks.itemId, itemId), eq(dailyMarks.day, day)))
  }
}

/**
 * Итог дня переписывается после каждой правки списка «Сегодня»: пункт отметили, сняли,
 * добавили или удалили — день мог и закрыться, и открыться обратно.
 */
export async function recordDay(noteId: string, day: string): Promise<void> {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      done: sql<number>`count(${dailyMarks.itemId})`.mapWith(Number),
    })
    .from(noteItems)
    .leftJoin(dailyMarks, markedOn(day))
    .where(dayItems(noteId, day))

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
