import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { DEFAULT_CALENDAR_COLOR } from '../../lib/calendar-colors.ts'
import { db } from '../db/client.ts'
import { googleAccounts, googleTaskLists, googleTasks } from '../db/schema.ts'
import {
  type GoogleTask,
  type TaskPatch,
  TaskEtagMismatchError,
  fetchTask,
  patchTask,
} from '../google/tasks.ts'
import { ConflictError, InvalidInputError, NotFoundError } from './errors.ts'
import { accessTokenFor } from './google-accounts.ts'
import { applyTasks } from './google-tasks-sync.ts'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export type CalendarTask = {
  id: string
  /** Цвет аккаунта: своего у задачи нет, как и у события. */
  color: string
  title: string | null
  /** Дата без времени. Задача без срока на сетке не показывается и сюда не попадает. */
  due: string
  completed: boolean
}

/** Задача изнутри, для панели правки: то же, что в сетке, плюс заметки и список. */
export type CalendarTaskDetails = CalendarTask & {
  notes: string | null
  taskListTitle: string
  /** Ссылка на задачу в веб-интерфейсе Google. */
  webViewLink: string | null
}

export type TaskChanges = {
  title?: string | null
  notes?: string | null
  due?: string | null
  completed?: boolean
}

export type TaskWriteResult = {
  taskId: string
  /** Правку пришлось накладывать заново: задачу успели поправить в Google. */
  conflict: boolean
  /** Задача в Google стёрта — правка не применялась. */
  goneInGoogle: boolean
}

const LISTED = {
  id: googleTasks.id,
  color: googleAccounts.color,
  title: googleTasks.title,
  due: googleTasks.due,
  status: googleTasks.status,
}

const DETAILED = {
  ...LISTED,
  notes: googleTasks.notes,
  taskListTitle: googleTaskLists.title,
  webViewLink: googleTasks.webViewLink,
}

const alive = () => and(isNull(googleTasks.deletedAt), isNull(googleTaskLists.deletedAt))

function summarize<T extends { color: string | null; status: string }>(row: T) {
  const { status, ...rest } = row
  return { ...rest, color: rest.color ?? DEFAULT_CALENDAR_COLOR, completed: status === 'completed' }
}

/**
 * Задачи со сроком внутри окна дат (обе границы включительно). Сравнение идёт датами как
 * строками, без всякого перевода в момент: у срока задачи времени нет вовсе, и часовой
 * пояс сдвинул бы его на сутки (инвариант 3).
 */
export async function listTasks(from: string, to: string): Promise<CalendarTask[]> {
  if (!DATE.test(from) || !DATE.test(to)) {
    throw new InvalidInputError('границы окна — даты вида 2026-09-02')
  }
  if (to < from) throw new InvalidInputError('окно кончается не раньше, чем начинается')

  const rows = await db
    .select(LISTED)
    .from(googleTasks)
    .innerJoin(googleTaskLists, eq(googleTaskLists.id, googleTasks.taskListId))
    .innerJoin(googleAccounts, eq(googleAccounts.id, googleTasks.accountId))
    .where(
      and(
        alive(),
        isNotNull(googleTasks.due),
        gte(googleTasks.due, from),
        lte(googleTasks.due, to),
      ),
    )
    .orderBy(asc(googleTasks.due), asc(googleTasks.title))

  return rows.map((row) => ({ ...summarize(row), due: row.due as string }))
}

export async function getTask(id: string): Promise<CalendarTaskDetails> {
  const [row] = await db
    .select(DETAILED)
    .from(googleTasks)
    .innerJoin(googleTaskLists, eq(googleTaskLists.id, googleTasks.taskListId))
    .innerJoin(googleAccounts, eq(googleAccounts.id, googleTasks.accountId))
    .where(and(eq(googleTasks.id, id), alive()))
  if (!row) throw new NotFoundError(`задачи ${id} нет`)

  return { ...summarize(row), due: row.due as string }
}

function normalize(changes: TaskChanges): TaskPatch {
  const patch: TaskPatch = {}
  if ('title' in changes) patch.title = changes.title?.trim() || null
  if ('notes' in changes) patch.notes = changes.notes?.trim() || null
  if ('due' in changes) {
    const due = changes.due?.trim() || null
    if (due !== null && !DATE.test(due)) {
      throw new InvalidInputError('срок задачи — дата вида 2026-09-02')
    }
    patch.due = due
  }
  if (changes.completed !== undefined) patch.completed = changes.completed

  if (Object.keys(patch).length === 0) throw new InvalidInputError('править нечего')
  return patch
}

/** Задача, стёртая в Google: гасится тем же путём, что и присланная синхронизацией. */
function goneTask(googleTaskId: string): GoogleTask {
  return {
    googleTaskId,
    title: null,
    notes: null,
    due: null,
    completed: false,
    completedAt: null,
    etag: null,
    googleUpdatedAt: null,
    webViewLink: null,
    deleted: true,
  }
}

async function locateTask(id: string) {
  const [task] = await db
    .select({
      id: googleTasks.id,
      accountId: googleTasks.accountId,
      taskListId: googleTasks.taskListId,
      googleTaskId: googleTasks.googleTaskId,
      etag: googleTasks.etag,
      deletedAt: googleTasks.deletedAt,
      googleTaskListId: googleTaskLists.googleTaskListId,
    })
    .from(googleTasks)
    .innerJoin(googleTaskLists, eq(googleTaskLists.id, googleTasks.taskListId))
    .where(eq(googleTasks.id, id))
  if (!task || task.deletedAt) throw new NotFoundError(`задачи ${id} нет`)

  return task
}

function reportConflict(googleTaskId: string, ours: TaskPatch, theirs: GoogleTask | null): void {
  const when = theirs?.googleUpdatedAt?.toISOString() ?? 'неизвестно когда'
  const what = theirs ? `правка в Google от ${when}` : 'задача стёрта в Google'
  console.warn(
    `конфликт записи задачи ${googleTaskId}: ${what}, наш etag устарел;` +
      ` наши поля: ${Object.keys(ours).join(', ')}`,
  )
}

/**
 * Правка задачи в Google: `PATCH` с `If-Match`, и отметка выполнения идёт тем же путём.
 * На `412` задача перечитывается, чужая версия ложится в базу, и правка накладывается
 * поверх неё вторым `PATCH` — правило «выигрывает более свежая правка».
 *
 * Ответ Google раскладывается у себя тем же кодом, что и синхронизация: своего
 * представления о том, что записалось, мы не строим.
 */
export async function updateTask(id: string, changes: TaskChanges): Promise<TaskWriteResult> {
  const patch = normalize(changes)
  const task = await locateTask(id)
  const accessToken = await accessTokenFor(task.accountId)

  try {
    const written = await patchTask(
      accessToken,
      task.googleTaskListId,
      task.googleTaskId,
      patch,
      task.etag,
    )
    await applyTasks(task.accountId, task.taskListId, [written])
    return { taskId: id, conflict: false, goneInGoogle: false }
  } catch (error) {
    if (!(error instanceof TaskEtagMismatchError)) throw error
  }

  const current = await fetchTask(accessToken, task.googleTaskListId, task.googleTaskId)
  reportConflict(task.googleTaskId, patch, current)

  if (!current) {
    await applyTasks(task.accountId, task.taskListId, [goneTask(task.googleTaskId)])
    return { taskId: id, conflict: true, goneInGoogle: true }
  }

  await applyTasks(task.accountId, task.taskListId, [current])

  try {
    const written = await patchTask(
      accessToken,
      task.googleTaskListId,
      task.googleTaskId,
      patch,
      current.etag,
    )
    await applyTasks(task.accountId, task.taskListId, [written])
    return { taskId: id, conflict: true, goneInGoogle: false }
  } catch (error) {
    // второй подряд 412 — задачу правят прямо сейчас; крутить цикл дальше некуда
    if (error instanceof TaskEtagMismatchError) {
      throw new ConflictError(`задачу ${task.googleTaskId} правят в Google, правка не записана`)
    }
    throw error
  }
}
