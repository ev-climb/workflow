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
  /** Можно ли писать в календарь: подписной вроде «Праздников России» — только читать. */
  writable: boolean
}

const SELECT = {
  id: googleCalendars.id,
  accountId: googleCalendars.accountId,
  googleCalendarId: googleCalendars.googleCalendarId,
  title: googleCalendars.title,
  color: googleCalendars.color,
  visible: googleCalendars.visible,
  accessRole: googleCalendars.accessRole,
}

const WRITER_ROLES = new Set(['owner', 'writer'])

/**
 * Права неизвестны у календарей, заведённых до того, как мы стали их спрашивать: до
 * следующего подключения аккаунта считаем такой календарь доступным на запись. Иначе
 * выбор календаря опустел бы на ровном месте, а отказ Google мы и так переводим внятно.
 */
export function isWritable(accessRole: string | null): boolean {
  return accessRole === null || WRITER_ROLES.has(accessRole)
}

function summarize<T extends { accessRole: string | null }>(
  row: T,
): Omit<T, 'accessRole'> & { writable: boolean } {
  const { accessRole, ...rest } = row
  return { ...rest, writable: isWritable(accessRole) }
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
        accessRole: entry.accessRole,
        visible: entry.selected,
      })),
    )
    .onConflictDoUpdate({
      target: [googleCalendars.accountId, googleCalendars.googleCalendarId],
      // права меняются на стороне Google, поэтому обновляются, в отличие от цвета
      // и видимости: те выбраны пользователем
      set: {
        title: sql`excluded.title`,
        accessRole: sql`excluded.access_role`,
        updatedAt: new Date(),
      },
    })
}

/** Все календари всех аккаунтов: экран настроек сам раскладывает их по аккаунтам. */
export async function listGoogleCalendars(): Promise<GoogleCalendarSummary[]> {
  const rows = await db.select(SELECT).from(googleCalendars).orderBy(asc(googleCalendars.title))
  return rows.map(summarize)
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
  return summarize(calendar)
}
