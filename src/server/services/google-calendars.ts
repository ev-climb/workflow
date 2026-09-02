import { asc, eq, sql } from 'drizzle-orm'
import { isCalendarColor } from '../../lib/calendar-colors.ts'
import { db } from '../db/client.ts'
import { googleCalendars } from '../db/schema.ts'
import type { GoogleCalendarEntry } from '../google/calendars.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'

export type GoogleCalendarSummary = {
  id: string
  accountId: string
  googleCalendarId: string
  title: string
  color: string | null
  visible: boolean
}

const SELECT = {
  id: googleCalendars.id,
  accountId: googleCalendars.accountId,
  googleCalendarId: googleCalendars.googleCalendarId,
  title: googleCalendars.title,
  color: googleCalendars.color,
  visible: googleCalendars.visible,
}

/**
 * Список календарей аккаунта после подключения. Незнакомый заводится с цветом и отметкой,
 * как в Google; у знакомого обновляется только название — цвет и видимость выбраны
 * пользователем, и повторное подключение аккаунта не должно затирать этот выбор.
 *
 * Пропавший из Google календарь не удаляем: его события уже лежат у нас, а разбирается
 * с этим синхронизация.
 */
export async function saveCalendarList(
  accountId: string,
  entries: GoogleCalendarEntry[],
): Promise<void> {
  if (entries.length === 0) return

  await db
    .insert(googleCalendars)
    .values(
      entries.map((entry) => ({
        accountId,
        googleCalendarId: entry.googleCalendarId,
        title: entry.title,
        color: entry.color,
        visible: entry.selected,
      })),
    )
    .onConflictDoUpdate({
      target: [googleCalendars.accountId, googleCalendars.googleCalendarId],
      set: { title: sql`excluded.title`, updatedAt: new Date() },
    })
}

/** Все календари всех аккаунтов: экран настроек сам раскладывает их по аккаунтам. */
export function listGoogleCalendars(): Promise<GoogleCalendarSummary[]> {
  return db.select(SELECT).from(googleCalendars).orderBy(asc(googleCalendars.title))
}

/**
 * Цвет и видимость календаря. Цвет — любой `#rrggbb`, а не значение из набора: пришедший
 * из Google в набор не входит, и проверка по списку сбрасывала бы его на чужой.
 */
export async function updateGoogleCalendar(
  id: string,
  changes: { color?: string; visible?: boolean },
): Promise<GoogleCalendarSummary> {
  const patch: { color?: string; visible?: boolean; updatedAt: Date } = { updatedAt: new Date() }

  if (changes.color !== undefined) {
    const color = changes.color.trim().toLowerCase()
    if (!isCalendarColor(color)) {
      throw new InvalidInputError(`цвет календаря: ожидается #rrggbb, а не «${changes.color}»`)
    }
    patch.color = color
  }
  if (changes.visible !== undefined) patch.visible = changes.visible

  const [calendar] = await db
    .update(googleCalendars)
    .set(patch)
    .where(eq(googleCalendars.id, id))
    .returning(SELECT)

  if (!calendar) throw new NotFoundError(`календаря ${id} нет`)
  return calendar
}
