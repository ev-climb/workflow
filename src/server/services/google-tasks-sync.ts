import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { googleAccounts, googleTaskLists, googleTasks } from '../db/schema.ts'
import { type GoogleTask, TasksAccessError, fetchTaskLists, fetchTasks } from '../google/tasks.ts'
import { publishCalendarChanged } from './board-events.ts'
import { NotFoundError, ReauthRequiredError } from './errors.ts'
import { accessTokenFor } from './google-accounts.ts'

/**
 * Раз в месяц список читается целиком заново. Разъехавшийся `updatedMin` молча теряет
 * правки — в отличие от негодного sync-токена, который отвечает `410` (ADR-012).
 */
const FULL_RESYNC_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

const INSERT_CHUNK = 500

export type TaskListSyncResult = {
  taskListId: string
  mode: 'full' | 'incremental'
  /** Заведено или обновлено задач. */
  saved: number
  /** Помечено удалёнными: пришли с `deleted`. */
  deleted: number
}

export type AccountTasksSyncResult = {
  accountId: string
  lists: TaskListSyncResult[]
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let at = 0; at < items.length; at += size) result.push(items.slice(at, at + size))
  return result
}

/**
 * Списки аккаунта из Google к нам. Пропавший список гасится мягко (инвариант 5): его
 * задачи лежат у нас, а решать за пользователя, что их пора стереть, мы не будем.
 */
async function saveTaskLists(
  accountId: string,
  lists: { googleTaskListId: string; title: string }[],
): Promise<void> {
  const now = new Date()

  if (lists.length > 0) {
    await db
      .insert(googleTaskLists)
      .values(lists.map((list) => ({ accountId, ...list })))
      .onConflictDoUpdate({
        target: [googleTaskLists.accountId, googleTaskLists.googleTaskListId],
        set: { title: sql`excluded.title`, deletedAt: null, updatedAt: now },
      })
  }

  const gone = and(
    eq(googleTaskLists.accountId, accountId),
    isNull(googleTaskLists.deletedAt),
    lists.length > 0
      ? notInArray(
          googleTaskLists.googleTaskListId,
          lists.map((list) => list.googleTaskListId),
        )
      : undefined,
  )

  await db.update(googleTaskLists).set({ deletedAt: now, updatedAt: now }).where(gone)
}

async function markDeleted(accountId: string, tasks: GoogleTask[]): Promise<number> {
  let deleted = 0
  const now = new Date()

  for (const batch of chunks(tasks, INSERT_CHUNK)) {
    const updated = await db
      .update(googleTasks)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(googleTasks.accountId, accountId),
          inArray(
            googleTasks.googleTaskId,
            batch.map((task) => task.googleTaskId),
          ),
        ),
      )
      .returning({ id: googleTasks.id })
    deleted += updated.length
  }

  return deleted
}

async function saveTasks(
  accountId: string,
  taskListId: string,
  tasks: GoogleTask[],
): Promise<void> {
  const now = new Date()

  for (const batch of chunks(tasks, INSERT_CHUNK)) {
    await db
      .insert(googleTasks)
      .values(
        batch.map((task) => ({
          accountId,
          taskListId,
          googleTaskId: task.googleTaskId,
          title: task.title,
          notes: task.notes,
          due: task.due,
          status: task.completed ? 'completed' : 'needsAction',
          completedAt: task.completedAt,
          etag: task.etag,
          googleUpdatedAt: task.googleUpdatedAt,
          webViewLink: task.webViewLink,
          deletedAt: null,
        })),
      )
      .onConflictDoUpdate({
        target: [googleTasks.accountId, googleTasks.googleTaskId],
        set: {
          // переезд между списками приезжает обычной правкой в дельте целевого списка:
          // идентификатор задачи при нём не меняется (ADR-012)
          taskListId: sql`excluded.task_list_id`,
          title: sql`excluded.title`,
          notes: sql`excluded.notes`,
          due: sql`excluded.due`,
          status: sql`excluded.status`,
          completedAt: sql`excluded.completed_at`,
          etag: sql`excluded.etag`,
          googleUpdatedAt: sql`excluded.google_updated_at`,
          webViewLink: sql`excluded.web_view_link`,
          deletedAt: null,
          updatedAt: now,
        },
      })
  }
}

/** Пачка задач Google в базу: живые заводятся и обновляются, стёртые помечаются. */
export async function applyTasks(
  accountId: string,
  taskListId: string,
  tasks: GoogleTask[],
): Promise<{ saved: number; deleted: number }> {
  const live = tasks.filter((task) => !task.deleted)
  const gone = tasks.filter((task) => task.deleted)

  await saveTasks(accountId, taskListId, live)
  const deleted = await markDeleted(accountId, gone)

  // единственное место, где задачи меняются: и синхронизация, и запись отметки идут сюда.
  // сигнал общий с событиями — сетка перечитывается разом
  if (live.length > 0 || deleted > 0) publishCalendarChanged()

  return { saved: live.length, deleted }
}

/**
 * Один список. Без метки — весь список целиком, с меткой — дельта по `updatedMin`.
 * Метка двигается на миллисекунду вперёд от самого позднего `updated`, который прислал
 * Google: своим часам тут доверять нечего, а включающая граница вернула бы последнюю
 * задачу заново на каждом проходе.
 */
export async function syncTaskList(id: string, now: Date = new Date()): Promise<TaskListSyncResult> {
  const [list] = await db
    .select({
      id: googleTaskLists.id,
      accountId: googleTaskLists.accountId,
      googleTaskListId: googleTaskLists.googleTaskListId,
      updatedMin: googleTaskLists.updatedMin,
      syncedAt: googleTaskLists.syncedAt,
    })
    .from(googleTaskLists)
    .where(eq(googleTaskLists.id, id))
  if (!list) throw new NotFoundError(`списка задач ${id} нет`)

  const stale = !list.syncedAt || now.getTime() - list.syncedAt.getTime() > FULL_RESYNC_INTERVAL_MS
  const updatedMin = stale ? null : list.updatedMin

  const accessToken = await accessTokenFor(list.accountId)
  const page = await fetchTasks(accessToken, list.googleTaskListId, updatedMin)
  const counts = await applyTasks(list.accountId, id, page.tasks)

  await db
    .update(googleTaskLists)
    .set({
      // пустая дельта метку не двигает: двигать её нечем, а по своим часам — значит
      // потерять правку, сделанную между нашим и гугловским временем
      updatedMin: page.latestUpdatedAt
        ? new Date(page.latestUpdatedAt.getTime() + 1)
        : list.updatedMin,
      syncedAt: now,
      updatedAt: new Date(),
    })
    .where(eq(googleTaskLists.id, id))

  return { taskListId: id, mode: updatedMin ? 'incremental' : 'full', ...counts }
}

/**
 * Аккаунт целиком: сначала списки, потом дельта каждого. Проход не разбит по спискам
 * снаружи, потому что переезд задачи виден только в списке, куда она переехала, — список
 * задач, пропавший из выдачи, иначе оставил бы её висеть навсегда (ADR-012).
 */
export async function syncAccountTasks(
  accountId: string,
  now: Date = new Date(),
): Promise<AccountTasksSyncResult> {
  const accessToken = await accessTokenFor(accountId)
  await saveTaskLists(accountId, await fetchTaskLists(accessToken))

  const lists = await db
    .select({ id: googleTaskLists.id })
    .from(googleTaskLists)
    .where(and(eq(googleTaskLists.accountId, accountId), isNull(googleTaskLists.deletedAt)))
    .orderBy(asc(googleTaskLists.createdAt))

  const results: TaskListSyncResult[] = []
  for (const list of lists) results.push(await syncTaskList(list.id, now))

  return { accountId, lists: results }
}

export type TasksSyncRun = {
  results: AccountTasksSyncResult[]
  /** Аккаунты, на которых проход упал: остальные при этом синхронизированы. */
  failures: { accountId: string; error: unknown }[]
}

/**
 * Отказ в доступе к задачам чинится руками — переподключением аккаунта или включением
 * Tasks API, — и до этого повторяется каждый проход. Говорим о нём один раз на аккаунт,
 * пока он не пройдёт: минутный таймер иначе забьёт лог одним и тем же.
 */
const reportedAccessFailures = new Set<string>()

export async function syncAllTasks(now: Date = new Date()): Promise<TasksSyncRun> {
  const accounts = await db
    .select({ id: googleAccounts.id, email: googleAccounts.email })
    .from(googleAccounts)
    .where(eq(googleAccounts.needsReauth, false))
    .orderBy(asc(googleAccounts.createdAt))

  const results: AccountTasksSyncResult[] = []
  const failures: { accountId: string; error: unknown }[] = []

  for (const account of accounts) {
    try {
      results.push(await syncAccountTasks(account.id, now))
      reportedAccessFailures.delete(account.id)
    } catch (error) {
      if (error instanceof ReauthRequiredError) continue
      if (error instanceof TasksAccessError) {
        if (!reportedAccessFailures.has(account.id)) {
          reportedAccessFailures.add(account.id)
          console.warn(`задачи аккаунта ${account.email} не синхронизируются: ${error.message}`)
        }
        continue
      }
      failures.push({ accountId: account.id, error })
    }
  }

  return { results, failures }
}
