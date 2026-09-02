import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm'
import { addDays } from '../../lib/calendar-grid.ts'
import { momentInMoscow } from '../../lib/dates.ts'
import { db } from '../db/client.ts'
import { boards, cards, googleCalendars, lists, timeBlocks } from '../db/schema.ts'
import { deleteEvent, insertEvent, patchEvent } from '../google/events.ts'
import { publishCalendarChanged } from './board-events.ts'
import { ForbiddenError, InvalidInputError, NotFoundError } from './errors.ts'
import { accessTokenFor } from './google-accounts.ts'
import { isWritable } from './google-calendars.ts'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export type TimeBlock = {
  id: string
  cardId: string
  cardTitle: string
  boardId: string
  boardTitle: string
  startsAt: Date
  endsAt: Date
  /** Календарь, в котором висит зеркало, или `null`: блок живёт только у нас. */
  calendarId: string | null
}

export type TimeBlockSpan = { startsAt: Date; endsAt: Date }

const LISTED = {
  id: timeBlocks.id,
  cardId: cards.id,
  cardTitle: cards.title,
  boardId: boards.id,
  boardTitle: boards.title,
  startsAt: timeBlocks.startsAt,
  endsAt: timeBlocks.endsAt,
  calendarId: timeBlocks.calendarId,
}

function checkSpan(span: TimeBlockSpan): void {
  if (Number.isNaN(span.startsAt.getTime()) || Number.isNaN(span.endsAt.getTime())) {
    throw new InvalidInputError('время тайм-блока — годный момент')
  }
  // ноль длины запрещён и в базе: пустой блок не занимает на сетке ничего
  if (span.endsAt <= span.startsAt) {
    throw new InvalidInputError('тайм-блок кончается позже, чем начинается')
  }
}

/**
 * Тайм-блоки живых карточек, задевающие окно из московских дат (обе границы
 * включительно). У тайм-блока всегда пара моментов — формы «на весь день» у него нет,
 * поэтому окно берётся моментами, как у события со временем.
 *
 * Архив не отдаётся ни на одном уровне: время, отведённое под карточку, которой уже нет
 * на доске, на сетке ничего не значит.
 */
export async function listTimeBlocks(from: string, to: string): Promise<TimeBlock[]> {
  if (!DATE.test(from) || !DATE.test(to)) {
    throw new InvalidInputError('границы окна — даты вида 2026-09-02')
  }
  if (to < from) throw new InvalidInputError('окно кончается не раньше, чем начинается')

  const windowStart = momentInMoscow(from, '00:00')
  const windowEnd = momentInMoscow(addDays(to, 1), '00:00')

  return await db
    .select(LISTED)
    .from(timeBlocks)
    .innerJoin(cards, eq(timeBlocks.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(
      and(
        isNull(cards.archivedAt),
        isNull(lists.archivedAt),
        isNull(boards.archivedAt),
        lt(timeBlocks.startsAt, windowEnd),
        gt(timeBlocks.endsAt, windowStart),
      ),
    )
    .orderBy(asc(timeBlocks.startsAt), asc(cards.title))
}

const BLOCK = {
  id: timeBlocks.id,
  cardTitle: cards.title,
  startsAt: timeBlocks.startsAt,
  endsAt: timeBlocks.endsAt,
  calendarId: timeBlocks.calendarId,
  googleEventId: timeBlocks.googleEventId,
}

type Block = { calendarId: string | null; googleEventId: string | null }

async function locate(id: string) {
  const [row] = await db
    .select(BLOCK)
    .from(timeBlocks)
    .innerJoin(cards, eq(timeBlocks.cardId, cards.id))
    .where(eq(timeBlocks.id, id))
  if (!row) throw new NotFoundError(`тайм-блока ${id} нет`)

  return row
}

async function calendarOf(calendarId: string) {
  const [calendar] = await db
    .select({
      googleCalendarId: googleCalendars.googleCalendarId,
      accountId: googleCalendars.accountId,
      accessRole: googleCalendars.accessRole,
    })
    .from(googleCalendars)
    .where(eq(googleCalendars.id, calendarId))
  if (!calendar) throw new NotFoundError(`календаря ${calendarId} нет`)

  return calendar
}

/** Время зеркала: у тайм-блока всегда пара моментов, формы «на весь день» у него нет. */
const spanTimes = (span: TimeBlockSpan) => ({
  allDay: false as const,
  startsAt: span.startsAt,
  endsAt: span.endsAt,
  startDate: null,
  endDate: null,
})

/**
 * Снять зеркало в Google. Календарь и событие у блока ходят парой — это проверяет и
 * ограничение в схеме, — поэтому достаточно одного условия на оба поля.
 */
async function dropMirror(block: Block): Promise<void> {
  if (!block.calendarId || !block.googleEventId) return

  const calendar = await calendarOf(block.calendarId)
  const accessToken = await accessTokenFor(calendar.accountId)
  await deleteEvent(accessToken, calendar.googleCalendarId, block.googleEventId)
}

/**
 * Показать блок в Google: зеркальное событие с названием карточки в выбранном календаре.
 * Второй вызов с другим календарём переносит зеркало, а не заводит второе: блок один, и
 * событие у него одно — это же закреплено ограничением в схеме.
 */
export async function mirrorTimeBlock(id: string, calendarId: string): Promise<{ id: string }> {
  const block = await locate(id)
  const calendar = await calendarOf(calendarId)
  if (!isWritable(calendar.accessRole)) {
    throw new ForbiddenError('в этот календарь Google писать нельзя: он открыт только на чтение')
  }

  await dropMirror(block)
  const accessToken = await accessTokenFor(calendar.accountId)
  const event = await insertEvent(accessToken, calendar.googleCalendarId, {
    title: block.cardTitle,
    times: spanTimes(block),
  })

  await db
    .update(timeBlocks)
    .set({ calendarId, googleEventId: event.googleEventId, updatedAt: new Date() })
    .where(eq(timeBlocks.id, id))

  publishCalendarChanged()
  return { id }
}

/** Убрать зеркало из Google. Сам блок остаётся на сетке: он и есть намерение. */
export async function unmirrorTimeBlock(id: string): Promise<{ id: string }> {
  const block = await locate(id)
  await dropMirror(block)

  await db
    .update(timeBlocks)
    .set({ calendarId: null, googleEventId: null, updatedAt: new Date() })
    .where(eq(timeBlocks.id, id))

  publishCalendarChanged()
  return { id }
}

/**
 * Время под карточку: блок заводится броском карточки на сетку. Своего названия у него
 * нет и не будет — он показывает карточку, а не отдельную запись, и переименовывать его
 * отдельно от неё значило бы развести их по смыслу.
 */
export async function createTimeBlock(input: {
  cardId: string
  startsAt: Date
  endsAt: Date
}): Promise<{ id: string; cardId: string }> {
  checkSpan(input)

  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(
      and(
        eq(cards.id, input.cardId),
        isNull(cards.archivedAt),
        isNull(lists.archivedAt),
        isNull(boards.archivedAt),
      ),
    )
  if (!card) throw new NotFoundError(`карточки ${input.cardId} нет`)

  const [created] = await db
    .insert(timeBlocks)
    .values({ cardId: card.id, startsAt: input.startsAt, endsAt: input.endsAt })
    .returning({ id: timeBlocks.id })

  publishCalendarChanged()
  return { id: created.id, cardId: card.id }
}

/**
 * Перенос и растягивание — одна запись: с сетки всегда приходит пара границ целиком,
 * и разводить их по разным вызовам значило бы дать блоку промежуточное состояние.
 */
export async function moveTimeBlock(id: string, span: TimeBlockSpan): Promise<{ id: string }> {
  checkSpan(span)
  const block = await locate(id)

  // Google первым: блок, уехавший в базе, но не в зеркале, врал бы молча
  if (block.calendarId && block.googleEventId) {
    const calendar = await calendarOf(block.calendarId)
    const accessToken = await accessTokenFor(calendar.accountId)
    // `If-Match` не шлём: своего etag у зеркала нет, а спорить за него не с кем
    await patchEvent(
      accessToken,
      calendar.googleCalendarId,
      block.googleEventId,
      { times: spanTimes(span) },
      null,
    )
  }

  const [updated] = await db
    .update(timeBlocks)
    .set({ startsAt: span.startsAt, endsAt: span.endsAt, updatedAt: new Date() })
    .where(eq(timeBlocks.id, id))
    .returning({ id: timeBlocks.id })
  if (!updated) throw new NotFoundError(`тайм-блока ${id} нет`)

  publishCalendarChanged()
  return updated
}

/**
 * Тайм-блок стирается насовсем: архива у него нет, потому что нет и самостоятельного
 * содержимого — снятый с сетки блок это просто отменённое намерение, а сама карточка
 * остаётся на доске. Зеркало уходит вместе с ним: событие без блока ничего не значит.
 */
export async function removeTimeBlock(id: string): Promise<{ id: string }> {
  await dropMirror(await locate(id))

  const [removed] = await db
    .delete(timeBlocks)
    .where(eq(timeBlocks.id, id))
    .returning({ id: timeBlocks.id })
  if (!removed) throw new NotFoundError(`тайм-блока ${id} нет`)

  publishCalendarChanged()
  return removed
}
