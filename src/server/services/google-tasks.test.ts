import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.ts'
import { googleAccounts, googleTaskLists, googleTasks } from '../db/schema.ts'
import { type GoogleTask, TaskEtagMismatchError } from '../google/tasks.ts'
import { ConflictError, NotFoundError } from './errors.ts'
import { getTask, listTasks, updateTask } from './google-tasks.ts'

vi.mock('../google/tasks.ts', async (importActual) => {
  const actual = await importActual<typeof import('../google/tasks.ts')>()
  return { ...actual, fetchTask: vi.fn(), patchTask: vi.fn() }
})
vi.mock('./google-accounts.ts', async (importActual) => {
  const actual = await importActual<typeof import('./google-accounts.ts')>()
  return { ...actual, accessTokenFor: vi.fn() }
})

const { fetchTask, patchTask } = vi.mocked(await import('../google/tasks.ts'))
const { accessTokenFor } = vi.mocked(await import('./google-accounts.ts'))

beforeEach(() => {
  vi.clearAllMocks()
  accessTokenFor.mockResolvedValue('ya29.access')
})

function google(patch: Partial<GoogleTask> = {}): GoogleTask {
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

async function stored(patch: Partial<typeof googleTasks.$inferInsert> = {}) {
  const [account] = await db
    .insert(googleAccounts)
    .values({
      email: `${crypto.randomUUID()}@gmail.com`,
      refreshTokenEncrypted: 'шифротекст',
      color: '#3b82f6',
    })
    .returning({ id: googleAccounts.id })

  const [list] = await db
    .insert(googleTaskLists)
    .values({ accountId: account.id, googleTaskListId: 'MTIz', title: 'Мои задачи' })
    .returning({ id: googleTaskLists.id })

  const [task] = await db
    .insert(googleTasks)
    .values({
      accountId: account.id,
      taskListId: list.id,
      googleTaskId: 't1',
      title: 'Купить билеты',
      due: '2026-10-01',
      etag: '"1"',
      ...patch,
    })
    .returning({ id: googleTasks.id })

  return { accountId: account.id, taskListId: list.id, id: task.id }
}

describe('выборка задач на сетку', () => {
  it('отдаёт задачи со сроком в окне и красит цветом аккаунта', async () => {
    const { id } = await stored()

    const tasks = await listTasks('2026-10-01', '2026-10-07')

    expect(tasks.find((task) => task.id === id)).toMatchObject({
      due: '2026-10-01',
      color: '#3b82f6',
      completed: false,
    })
  })

  it('границы окна включающие с обеих сторон', async () => {
    const { id } = await stored({ googleTaskId: 't-edge', due: '2026-10-07' })

    const inside = await listTasks('2026-10-01', '2026-10-07')
    const outside = await listTasks('2026-10-01', '2026-10-06')

    expect(inside.some((task) => task.id === id)).toBe(true)
    expect(outside.some((task) => task.id === id)).toBe(false)
  })

  it('задача без срока на сетку не идёт', async () => {
    const { id } = await stored({ googleTaskId: 't-nodue', due: null })

    const tasks = await listTasks('2026-01-01', '2027-01-01')

    expect(tasks.some((task) => task.id === id)).toBe(false)
  })

  it('погашенная задача и задача из погашенного списка не показываются', async () => {
    const gone = await stored({ googleTaskId: 't-gone', deletedAt: new Date() })
    const orphan = await stored({ googleTaskId: 't-orphan' })
    await db
      .update(googleTaskLists)
      .set({ deletedAt: new Date() })
      .where(eq(googleTaskLists.id, orphan.taskListId))

    const tasks = await listTasks('2026-10-01', '2026-10-07')

    expect(tasks.some((task) => task.id === gone.id)).toBe(false)
    expect(tasks.some((task) => task.id === orphan.id)).toBe(false)
  })

  it('выполненная задача с сетки не пропадает: она гасится, а не прячется', async () => {
    const { id } = await stored({ googleTaskId: 't-done', status: 'completed' })

    const tasks = await listTasks('2026-10-01', '2026-10-07')

    expect(tasks.find((task) => task.id === id)).toMatchObject({ completed: true })
  })

  it('задачу целиком отдаёт со списком и заметками', async () => {
    const { id } = await stored({ googleTaskId: 't-details', notes: 'через агрегатор' })

    expect(await getTask(id)).toMatchObject({
      notes: 'через агрегатор',
      taskListTitle: 'Мои задачи',
    })
  })

  it('погашенной задачи для панели нет', async () => {
    const { id } = await stored({ googleTaskId: 't-hidden', deletedAt: new Date() })

    await expect(getTask(id)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('отметка выполнения', () => {
  it('уходит в Google под If-Match и раскладывается ответом Google', async () => {
    const { id } = await stored({ googleTaskId: 't-check' })
    patchTask.mockResolvedValue(
      google({
        googleTaskId: 't-check',
        completed: true,
        completedAt: new Date('2026-09-03T09:00:00.000Z'),
        etag: '"2"',
      }),
    )

    const result = await updateTask(id, { completed: true })

    expect(result).toEqual({ taskId: id, conflict: false, goneInGoogle: false })
    expect(patchTask.mock.calls[0][3]).toEqual({ completed: true })
    expect(patchTask.mock.calls[0][4]).toBe('"1"')

    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved).toMatchObject({ status: 'completed', etag: '"2"' })
  })

  it('на устаревшем etag правка накладывается поверх чужой версии', async () => {
    const { id } = await stored({ googleTaskId: 't-conflict' })
    patchTask
      .mockRejectedValueOnce(new TaskEtagMismatchError('устарел', 412))
      .mockResolvedValueOnce(google({ googleTaskId: 't-conflict', completed: true, etag: '"3"' }))
    fetchTask.mockResolvedValue(
      google({ googleTaskId: 't-conflict', title: 'Купить билеты в Псков', etag: '"2"' }),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await updateTask(id, { completed: true })

    expect(result).toMatchObject({ conflict: true, goneInGoogle: false })
    expect(patchTask.mock.calls[1][4]).toBe('"2"')

    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved).toMatchObject({ status: 'completed', etag: '"3"' })
    warn.mockRestore()
  })

  it('задача, стёртая в Google, гасится, а не воскрешается правкой', async () => {
    const { id } = await stored({ googleTaskId: 't-vanished' })
    patchTask.mockRejectedValue(new TaskEtagMismatchError('устарел', 412))
    fetchTask.mockResolvedValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await updateTask(id, { completed: true })

    expect(result).toMatchObject({ conflict: true, goneInGoogle: true })
    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved.deletedAt).not.toBeNull()
    warn.mockRestore()
  })

  it('второй подряд отказ по etag — конфликт, а не бесконечный цикл', async () => {
    const { id } = await stored({ googleTaskId: 't-busy' })
    patchTask.mockRejectedValue(new TaskEtagMismatchError('устарел', 412))
    fetchTask.mockResolvedValue(google({ googleTaskId: 't-busy', etag: '"2"' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(updateTask(id, { completed: true })).rejects.toBeInstanceOf(ConflictError)
    expect(patchTask).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})
