import { asc, eq, isNull, sql } from 'drizzle-orm'
import { isCalendarMode, type CalendarMode } from '../../lib/calendar-grid.ts'
import { clampRatio } from '../../lib/split-ratio.ts'
import { db } from '../db/client.ts'
import { boards, workspaceState } from '../db/schema.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'

export const SINGLE_ROW = 1

export type Slot = 'top' | 'bottom'

export type WorkspaceState = {
  topBoardId: string | null
  bottomBoardId: string | null
  topBoardRatio: number
  calendarMode: CalendarMode
}

const SELECT = {
  topBoardId: workspaceState.topBoardId,
  bottomBoardId: workspaceState.bottomBoardId,
  topBoardRatio: workspaceState.topBoardRatio,
  calendarMode: workspaceState.calendarMode,
}

/**
 * Состояние рабочего стола, одна строка на всё приложение. Слоты заполняются первыми
 * двумя досками ровно один раз — при заведении строки: пустой экран при живых досках
 * выглядит поломкой. Дальше пустой слот означает осознанный выбор, и трогать его нельзя,
 * иначе `setBoardSlot(slot, null)` отменялся бы следующим же чтением.
 */
export async function getWorkspaceState(): Promise<WorkspaceState> {
  const [existing] = await db
    .select(SELECT)
    .from(workspaceState)
    .where(eq(workspaceState.id, SINGLE_ROW))

  if (existing) return existing

  const available = await db
    .select({ id: boards.id })
    .from(boards)
    .where(isNull(boards.archivedAt))
    .orderBy(asc(boards.rank))
    .limit(2)

  const [created] = await db
    .insert(workspaceState)
    .values({
      id: SINGLE_ROW,
      topBoardId: available[0]?.id ?? null,
      bottomBoardId: available[1]?.id ?? available[0]?.id ?? null,
    })
    .onConflictDoNothing()
    .returning(SELECT)

  if (created) return created

  // строку успели завести между нашим чтением и вставкой
  const [row] = await db
    .select(SELECT)
    .from(workspaceState)
    .where(eq(workspaceState.id, SINGLE_ROW))

  return row
}

/** Одну и ту же доску разрешено поставить в оба слота. */
export async function setBoardSlot(slot: Slot, boardId: string | null): Promise<WorkspaceState> {
  if (boardId) {
    const [board] = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, boardId))
    if (!board) throw new NotFoundError(`доски ${boardId} нет`)
  }

  await getWorkspaceState()
  const column = slot === 'top' ? 'topBoardId' : 'bottomBoardId'

  const [state] = await db
    .update(workspaceState)
    .set({ [column]: boardId, updatedAt: new Date() })
    .where(eq(workspaceState.id, SINGLE_ROW))
    .returning(SELECT)

  return state
}

/** Доля высоты под верхнюю доску. Значение зажимается: слот не должен исчезать совсем. */
export async function setSplitRatio(ratio: number): Promise<WorkspaceState> {
  if (!Number.isFinite(ratio)) {
    throw new InvalidInputError(`доля высоты: нужно число, а не ${ratio}`)
  }

  const clamped = clampRatio(ratio)
  await getWorkspaceState()

  const [state] = await db
    .update(workspaceState)
    .set({ topBoardRatio: clamped, updatedAt: new Date() })
    .where(eq(workspaceState.id, SINGLE_ROW))
    .returning(SELECT)

  return state
}

/** Вид календарной колонки: день или неделя. */
export async function setCalendarMode(mode: string): Promise<WorkspaceState> {
  if (!isCalendarMode(mode)) {
    throw new InvalidInputError(`вид календаря: ожидается day или week, а не ${mode}`)
  }

  await getWorkspaceState()

  const [state] = await db
    .update(workspaceState)
    .set({ calendarMode: mode, updatedAt: new Date() })
    .where(eq(workspaceState.id, SINGLE_ROW))
    .returning(SELECT)

  return state
}

/** Слоты, указывающие на удалённую или заархивированную доску, гасятся. */
export async function forgetBoardInSlots(boardId: string): Promise<void> {
  await db
    .update(workspaceState)
    .set({
      topBoardId: sql`case when ${workspaceState.topBoardId} = ${boardId} then null else ${workspaceState.topBoardId} end`,
      bottomBoardId: sql`case when ${workspaceState.bottomBoardId} = ${boardId} then null else ${workspaceState.bottomBoardId} end`,
      updatedAt: new Date(),
    })
    .where(eq(workspaceState.id, SINGLE_ROW))
}
