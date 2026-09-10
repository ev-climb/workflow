import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { DEFAULT_CALENDAR_COLOR } from '../../lib/calendar-colors.ts'
import { isDay } from '../../lib/dates.ts'
import { db } from '../db/client.ts'
import { googleAccounts, googleTaskLists, googleTasks } from '../db/schema.ts'
import {
  type GoogleTask,
  type TaskPatch,
  TaskEtagMismatchError,
  deleteTask,
  fetchTask,
  insertTask,
  patchTask,
} from '../google/tasks.ts'
import { parseDayWindow } from './day-window.ts'
import { ConflictError, InvalidInputError, NotFoundError } from './errors.ts'
import { accessTokenFor } from './google-accounts.ts'
import { writeThroughEtag } from './google-shared.ts'
import { applyTasks } from './google-tasks-sync.ts'

export type CalendarTask = {
  id: string
  /** Цвет аккаунта: своего у задачи нет, как и у события. */
  color: string
  title: string | null
  /** Дата без времени. Задача без срока на сетке не показывается и сюда не попадает. */
  due: string
  /**
   * Часы внутри дня срока, `09:30`, либо `null` у задачи без времени. Пара живёт только
   * у нас: Tasks API времени не хранит вовсе (ADR-015). Часы московские, стенные —
   * моментом они становятся при отрисовке, а в базе датой не считаются (инвариант 3).
   */
  startTime: string | null
  endTime: string | null
  completed: boolean
}

/** Задача изнутри, для панели правки: то же, что в сетке, плюс заметки и список. */
export type CalendarTaskDetails = CalendarTask & {
  notes: string | null
  taskListTitle: string
  /** Ссылка на задачу в веб-интерфейсе Google. */
  webViewLink: string | null
}

/** Список задач для выбора при создании: своего цвета у списка нет, красится аккаунтом. */
export type TaskListSummary = {
  id: string
  accountId: string
  title: string
  color: string
  /** Почта аккаунта: списки двух аккаунтов зовутся одинаково, «Мои задачи». */
  accountEmail: string
}

/** Часы задачи внутри дня срока: пара целиком либо `null` — «без времени». */
export type TaskSlot = { startTime: string; endTime: string } | null

/** Новая задача: название и, необязательно, заметки, срок и часы внутри него. */
export type TaskDraft = {
  title: string | null
  notes?: string | null
  due?: string | null
  slot?: TaskSlot
}

export type TaskChanges = {
  title?: string | null
  notes?: string | null
  due?: string | null
  slot?: TaskSlot
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
  startTime: googleTasks.startTime,
  endTime: googleTasks.endTime,
  status: googleTasks.status,
}

const DETAILED = {
  ...LISTED,
  notes: googleTasks.notes,
  taskListTitle: googleTaskLists.title,
  webViewLink: googleTasks.webViewLink,
}

const alive = () => and(isNull(googleTasks.deletedAt), isNull(googleTaskLists.deletedAt))

/** `time` приезжает из Postgres с секундами: на сетке и в полях правки они лишние. */
const clockOf = (value: string | null) => value?.slice(0, 5) ?? null

type Summarizable = {
  color: string | null
  status: string
  startTime: string | null
  endTime: string | null
}

function summarize<T extends Summarizable>(row: T) {
  const { status, ...rest } = row
  return {
    ...rest,
    color: rest.color ?? DEFAULT_CALENDAR_COLOR,
    startTime: clockOf(rest.startTime),
    endTime: clockOf(rest.endTime),
    completed: status === 'completed',
  }
}

/**
 * Задачи со сроком внутри окна дат (обе границы включительно). Сравнение идёт датами как
 * строками, без всякого перевода в момент: у срока задачи времени нет вовсе, и часовой
 * пояс сдвинул бы его на сутки (инвариант 3).
 */
export async function listTasks(from: string, to: string): Promise<CalendarTask[]> {
  const window = parseDayWindow(from, to)

  const rows = await db
    .select(LISTED)
    .from(googleTasks)
    .innerJoin(googleTaskLists, eq(googleTaskLists.id, googleTasks.taskListId))
    .innerJoin(googleAccounts, eq(googleAccounts.id, googleTasks.accountId))
    .where(
      and(
        alive(),
        isNotNull(googleTasks.due),
        gte(googleTasks.due, window.from),
        lte(googleTasks.due, window.to),
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

/** Списки задач всех аккаунтов. Погашенные не предлагаются: писать в них уже некуда. */
export async function listTaskLists(): Promise<TaskListSummary[]> {
  const rows = await db
    .select({
      id: googleTaskLists.id,
      accountId: googleTaskLists.accountId,
      title: googleTaskLists.title,
      color: googleAccounts.color,
      accountEmail: googleAccounts.email,
    })
    .from(googleTaskLists)
    .innerJoin(googleAccounts, eq(googleAccounts.id, googleTaskLists.accountId))
    .where(isNull(googleTaskLists.deletedAt))
    .orderBy(asc(googleAccounts.email), asc(googleTaskLists.title))

  return rows.map((row) => ({ ...row, color: row.color ?? DEFAULT_CALENDAR_COLOR }))
}

function dueOf(value: string | null | undefined): string | null {
  const due = value?.trim() || null
  if (due !== null && !isDay(due)) {
    throw new InvalidInputError('срок задачи — дата вида 2026-09-02')
  }
  return due
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
// конец задачи упирается в полночь снизу: через сутки она не тянется, а до 24:00 доходит
const END_CLOCK = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/

/** Часы задачи: пара целиком, конец позже начала. Задача через полночь не тянется. */
function slotOf(slot: TaskSlot | undefined): TaskSlot | undefined {
  if (slot === undefined || slot === null) return slot
  if (!CLOCK.test(slot.startTime) || !END_CLOCK.test(slot.endTime)) {
    throw new InvalidInputError('время задачи — часы вида 09:30')
  }
  if (slot.endTime <= slot.startTime) {
    throw new InvalidInputError('время задачи кончается не позже, чем начинается')
  }
  return slot
}

/**
 * Правка врозь: название, заметки, срок и отметка уходят в Google, часы остаются у нас
 * (ADR-015). Снятый срок уносит часы за собой — держать их не на чем.
 */
function normalize(changes: TaskChanges): { patch: TaskPatch; slot: TaskSlot | undefined } {
  const patch: TaskPatch = {}
  if ('title' in changes) patch.title = changes.title?.trim() || null
  if ('notes' in changes) patch.notes = changes.notes?.trim() || null
  if ('due' in changes) patch.due = dueOf(changes.due)
  if (changes.completed !== undefined) patch.completed = changes.completed

  const slot = patch.due === null ? null : slotOf(changes.slot)

  if (Object.keys(patch).length === 0 && slot === undefined) {
    throw new InvalidInputError('править нечего')
  }
  return { patch, slot }
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
      due: googleTasks.due,
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

/**
 * Часы к себе. Срок к этому моменту мог оказаться пустым — ответ Google приходит раньше,
 * а стёртая задача возвращается вовсе без него; часы без дня держать не на чем, и
 * проверка в базе такую пару не пропустит.
 */
async function setSlot(id: string, slot: TaskSlot): Promise<void> {
  const kept = (value: string | null) =>
    value === null
      ? null
      : sql`case when ${googleTasks.due} is null then null else ${value}::time end`

  await db
    .update(googleTasks)
    .set({
      startTime: kept(slot?.startTime ?? null),
      endTime: kept(slot?.endTime ?? null),
      updatedAt: new Date(),
    })
    .where(eq(googleTasks.id, id))
}

/**
 * Правка задачи в Google, и отметка выполнения идёт тем же путём. Разрешение конфликта
 * на `412` общее с событиями — оно в `writeThroughEtag`.
 *
 * Ответ Google раскладывается у себя тем же кодом, что и синхронизация: своего
 * представления о том, что записалось, мы не строим.
 */
export async function updateTask(id: string, changes: TaskChanges): Promise<TaskWriteResult> {
  const { patch, slot } = normalize(changes)
  const task = await locateTask(id)

  if (slot && (patch.due ?? task.due) === null) {
    throw new InvalidInputError('время задачи без срока держать не на чем')
  }

  // правили одни часы: в Google идти незачем, там их нет и не будет
  if (Object.keys(patch).length === 0) {
    if (slot !== undefined) await setSlot(id, slot)
    return { taskId: id, conflict: false, goneInGoogle: false }
  }

  const accessToken = await accessTokenFor(task.accountId)

  const written = await writeThroughEtag({
    subject: { of: 'задачи', gone: 'задача стёрта в Google', edited: 'задачу' },
    googleId: task.googleTaskId,
    fields: Object.keys(patch),
    etag: task.etag,
    mismatch: TaskEtagMismatchError,
    patch: (etag) => patchTask(accessToken, task.googleTaskListId, task.googleTaskId, patch, etag),
    fetch: () => fetchTask(accessToken, task.googleTaskListId, task.googleTaskId),
    apply: async (remote) => {
      await applyTasks(task.accountId, task.taskListId, [remote])
    },
    gone: () => goneTask(task.googleTaskId),
  })

  // часы пишутся после Google: отказ в записи дня не должен оставлять их на новом месте,
  // а стёртой задаче правка не применялась вовсе
  if (slot !== undefined && !written.goneInGoogle) await setSlot(id, slot)

  return { taskId: id, ...written }
}

/**
 * Новая задача в списке Google. Ответ Google раскладывается тем же кодом, что и
 * синхронизация: своего представления о записанном не строим — как и у события.
 *
 * Срок кладётся датой, какой пришёл: приводить его к московскому времени нечего, времени
 * у срока задачи нет вовсе (инвариант 3, ADR-012). Часы внутри дня, если их задали,
 * дописываются к себе вторым запросом — в Google им места нет (ADR-015).
 */
export async function createTask(taskListId: string, draft: TaskDraft): Promise<{ taskId: string }> {
  const patch: TaskPatch = { title: draft.title?.trim() || null }
  if (draft.notes !== undefined) patch.notes = draft.notes?.trim() || null
  if (draft.due !== undefined) patch.due = dueOf(draft.due)

  const slot = slotOf(draft.slot) ?? null
  if (slot !== null && !patch.due) {
    throw new InvalidInputError('время задачи без срока держать не на чем')
  }

  const [list] = await db
    .select({
      id: googleTaskLists.id,
      accountId: googleTaskLists.accountId,
      googleTaskListId: googleTaskLists.googleTaskListId,
      deletedAt: googleTaskLists.deletedAt,
    })
    .from(googleTaskLists)
    .where(eq(googleTaskLists.id, taskListId))
  if (!list || list.deletedAt) throw new NotFoundError(`списка задач ${taskListId} нет`)

  const accessToken = await accessTokenFor(list.accountId)
  const created = await insertTask(accessToken, list.googleTaskListId, patch)
  await applyTasks(list.accountId, list.id, [created])

  const [row] = await db
    .select({ id: googleTasks.id })
    .from(googleTasks)
    .where(
      and(
        eq(googleTasks.taskListId, list.id),
        eq(googleTasks.googleTaskId, created.googleTaskId),
      ),
    )
  if (!row) throw new ConflictError('Google завёл задачу, но записать её к себе не вышло')

  if (slot !== null) await setSlot(row.id, slot)

  return { taskId: row.id }
}

/**
 * Задача насовсем — и в Google тоже. Нужна смене типа: задача, ставшая событием, обязана
 * из Tasks уйти, иначе одна запись раздвоится (ADR-015). Обычная правка сюда не ходит:
 * задачи гасятся отметкой выполнения, а не удалением.
 */
export async function removeTask(id: string): Promise<{ taskId: string }> {
  const task = await locateTask(id)
  const accessToken = await accessTokenFor(task.accountId)

  await deleteTask(accessToken, task.googleTaskListId, task.googleTaskId)
  await applyTasks(task.accountId, task.taskListId, [goneTask(task.googleTaskId)])

  return { taskId: id }
}
