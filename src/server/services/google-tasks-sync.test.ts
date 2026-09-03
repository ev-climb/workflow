import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.ts'
import { googleAccounts, googleTaskLists, googleTasks } from '../db/schema.ts'
import { type GoogleTask, TasksAccessError } from '../google/tasks.ts'
import { syncAccountTasks, syncAllTasks, syncTaskList } from './google-tasks-sync.ts'

vi.mock('../google/tasks.ts', async (importActual) => {
  const actual = await importActual<typeof import('../google/tasks.ts')>()
  return { ...actual, fetchTaskLists: vi.fn(), fetchTasks: vi.fn() }
})
vi.mock('./google-accounts.ts', async (importActual) => {
  const actual = await importActual<typeof import('./google-accounts.ts')>()
  return { ...actual, accessTokenFor: vi.fn() }
})

const { fetchTaskLists, fetchTasks } = vi.mocked(await import('../google/tasks.ts'))
const { accessTokenFor } = vi.mocked(await import('./google-accounts.ts'))

beforeEach(() => {
  vi.clearAllMocks()
  accessTokenFor.mockResolvedValue('ya29.access')
  fetchTaskLists.mockResolvedValue([{ googleTaskListId: 'MTIz', title: 'Мои задачи' }])
})

async function account(email = `${crypto.randomUUID()}@gmail.com`) {
  const [row] = await db
    .insert(googleAccounts)
    .values({ email, refreshTokenEncrypted: 'шифротекст', color: '#3b82f6' })
    .returning({ id: googleAccounts.id })
  return row.id
}

async function taskList(patch: { updatedMin?: Date; syncedAt?: Date } = {}) {
  const accountId = await account()
  const [row] = await db
    .insert(googleTaskLists)
    .values({
      accountId,
      googleTaskListId: 'MTIz',
      title: 'Мои задачи',
      updatedMin: patch.updatedMin ?? null,
      syncedAt: patch.syncedAt ?? null,
    })
    .returning({ id: googleTaskLists.id })
  return { accountId, taskListId: row.id }
}

function task(patch: Partial<GoogleTask> = {}): GoogleTask {
  return {
    googleTaskId: 't1',
    title: 'Купить билеты',
    notes: null,
    due: '2026-10-01',
    completed: false,
    completedAt: null,
    etag: '"1"',
    googleUpdatedAt: new Date('2026-09-03T08:00:00.000Z'),
    webViewLink: null,
    deleted: false,
    ...patch,
  }
}

function page(tasks: GoogleTask[]) {
  const latest = tasks
    .map((one) => one.googleUpdatedAt)
    .filter((at): at is Date => at !== null)
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1)
  return { tasks, latestUpdatedAt: latest ?? null }
}

function tasksOf(accountId: string) {
  return db.select().from(googleTasks).where(eq(googleTasks.accountId, accountId))
}

describe('синхронизация списка задач', () => {
  it('без метки читает список целиком и запоминает метку следующей дельты', async () => {
    const { accountId, taskListId } = await taskList()
    fetchTasks.mockResolvedValue(page([task()]))

    const result = await syncTaskList(taskListId, new Date('2026-09-03T12:00:00.000Z'))

    expect(result).toMatchObject({ mode: 'full', saved: 1, deleted: 0 })
    expect(fetchTasks.mock.calls[0][2]).toBeNull()

    const [list] = await db
      .select({ updatedMin: googleTaskLists.updatedMin, syncedAt: googleTaskLists.syncedAt })
      .from(googleTaskLists)
      .where(eq(googleTaskLists.id, taskListId))
    // на миллисекунду позже самого позднего updated: включающая граница вернула бы
    // последнюю задачу заново каждым проходом
    expect(list.updatedMin).toEqual(new Date('2026-09-03T08:00:00.001Z'))
    expect(list.syncedAt).toEqual(new Date('2026-09-03T12:00:00.000Z'))

    const [saved] = await tasksOf(accountId)
    expect(saved).toMatchObject({ googleTaskId: 't1', due: '2026-10-01', status: 'needsAction' })
  })

  it('с меткой идёт дельтой', async () => {
    const { taskListId } = await taskList({
      updatedMin: new Date('2026-09-03T08:00:00.001Z'),
      syncedAt: new Date('2026-09-03T11:00:00.000Z'),
    })
    fetchTasks.mockResolvedValue(page([]))

    const result = await syncTaskList(taskListId, new Date('2026-09-03T12:00:00.000Z'))

    expect(result.mode).toBe('incremental')
    expect(fetchTasks.mock.calls[0][2]).toEqual(new Date('2026-09-03T08:00:00.001Z'))
  })

  it('метка старше месяца не используется: разъехавшийся updatedMin теряет правки молча', async () => {
    const { taskListId } = await taskList({
      updatedMin: new Date('2026-07-01T08:00:00.000Z'),
      syncedAt: new Date('2026-07-01T12:00:00.000Z'),
    })
    fetchTasks.mockResolvedValue(page([]))

    const result = await syncTaskList(taskListId, new Date('2026-09-03T12:00:00.000Z'))

    expect(result.mode).toBe('full')
    expect(fetchTasks.mock.calls[0][2]).toBeNull()
  })

  it('пустая дельта метку не двигает', async () => {
    const mark = new Date('2026-09-03T08:00:00.001Z')
    const { taskListId } = await taskList({ updatedMin: mark, syncedAt: new Date('2026-09-03T11:00:00.000Z') })
    fetchTasks.mockResolvedValue(page([]))

    await syncTaskList(taskListId, new Date('2026-09-03T12:00:00.000Z'))

    const [list] = await db
      .select({ updatedMin: googleTaskLists.updatedMin })
      .from(googleTaskLists)
      .where(eq(googleTaskLists.id, taskListId))
    expect(list.updatedMin).toEqual(mark)
  })

  it('срок на первое число ложится в базу той же датой', async () => {
    const { accountId, taskListId } = await taskList()
    fetchTasks.mockResolvedValue(page([task({ due: '2026-03-01' })]))

    await syncTaskList(taskListId, new Date('2026-09-03T12:00:00.000Z'))

    const [saved] = await tasksOf(accountId)
    expect(saved.due).toBe('2026-03-01')
  })

  it('выполненная задача приезжает отметкой, а не пропадает', async () => {
    const { accountId, taskListId } = await taskList()
    fetchTasks.mockResolvedValue(
      page([task({ completed: true, completedAt: new Date('2026-09-03T09:00:00.000Z') })]),
    )

    await syncTaskList(taskListId, new Date('2026-09-03T12:00:00.000Z'))

    const [saved] = await tasksOf(accountId)
    expect(saved).toMatchObject({
      status: 'completed',
      completedAt: new Date('2026-09-03T09:00:00.000Z'),
    })
  })

  it('стёртая в Google задача гасится мягко', async () => {
    const { accountId, taskListId } = await taskList()
    fetchTasks.mockResolvedValue(page([task()]))
    await syncTaskList(taskListId, new Date('2026-09-03T12:00:00.000Z'))

    fetchTasks.mockResolvedValue(page([task({ deleted: true, googleUpdatedAt: new Date('2026-09-03T13:00:00.000Z') })]))
    const result = await syncTaskList(taskListId, new Date('2026-09-03T13:30:00.000Z'))

    expect(result).toMatchObject({ saved: 0, deleted: 1 })
    const [saved] = await tasksOf(accountId)
    expect(saved.deletedAt).not.toBeNull()
  })
})

describe('синхронизация задач аккаунта', () => {
  it('переезд задачи в другой список меняет поле, а не заводит вторую строку', async () => {
    const accountId = await account()
    fetchTaskLists.mockResolvedValue([
      { googleTaskListId: 'MTIz', title: 'Мои задачи' },
      { googleTaskListId: 'NDU2', title: 'Работа' },
    ])
    fetchTasks.mockImplementation(async (_token, listId) =>
      listId === 'MTIz' ? page([task()]) : page([]),
    )
    await syncAccountTasks(accountId, new Date('2026-09-03T12:00:00.000Z'))

    fetchTasks.mockImplementation(async (_token, listId) =>
      listId === 'NDU2'
        ? page([task({ googleUpdatedAt: new Date('2026-09-03T13:00:00.000Z') })])
        : page([]),
    )
    await syncAccountTasks(accountId, new Date('2026-09-03T13:30:00.000Z'))

    const rows = await tasksOf(accountId)
    expect(rows).toHaveLength(1)

    const [target] = await db
      .select({ id: googleTaskLists.id })
      .from(googleTaskLists)
      .where(eq(googleTaskLists.googleTaskListId, 'NDU2'))
    expect(rows[0].taskListId).toBe(target.id)
  })

  it('пропавший из Google список гасится мягко', async () => {
    const accountId = await account()
    fetchTasks.mockResolvedValue(page([]))
    await syncAccountTasks(accountId, new Date('2026-09-03T12:00:00.000Z'))

    fetchTaskLists.mockResolvedValue([])
    await syncAccountTasks(accountId, new Date('2026-09-03T13:00:00.000Z'))

    const [list] = await db
      .select({ deletedAt: googleTaskLists.deletedAt })
      .from(googleTaskLists)
      .where(eq(googleTaskLists.accountId, accountId))
    expect(list.deletedAt).not.toBeNull()
  })
})

describe('проход по всем аккаунтам', () => {
  it('отказ в доступе не роняет проход и не считается падением', async () => {
    const accountId = await account()
    fetchTaskLists.mockImplementation(async () => {
      throw new TasksAccessError('Google отказал: области tasks у токена нет', 403)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const run = await syncAllTasks(new Date('2026-09-03T12:00:00.000Z'))

    expect(run.failures.some((failure) => failure.accountId === accountId)).toBe(false)
    expect(run.results.some((result) => result.accountId === accountId)).toBe(false)
    warn.mockRestore()
  })
})
