import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.ts'
import { googleAccounts, googleTaskLists, googleTasks } from '../db/schema.ts'
import { type GoogleTask, TaskEtagMismatchError } from '../google/tasks.ts'
import { ConflictError, InvalidInputError, NotFoundError } from './errors.ts'
import { createTask, getTask, listTaskLists, listTasks, updateTask } from './google-tasks.ts'
import { applyTasks } from './google-tasks-sync.ts'

vi.mock('../google/tasks.ts', async (importActual) => {
  const actual = await importActual<typeof import('../google/tasks.ts')>()
  return { ...actual, fetchTask: vi.fn(), insertTask: vi.fn(), patchTask: vi.fn() }
})
vi.mock('./google-accounts.ts', async (importActual) => {
  const actual = await importActual<typeof import('./google-accounts.ts')>()
  return { ...actual, accessTokenFor: vi.fn() }
})

const { fetchTask, insertTask, patchTask } = vi.mocked(await import('../google/tasks.ts'))
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

describe('списки задач для выбора', () => {
  it('отдаёт живые списки с почтой аккаунта и его цветом', async () => {
    const { taskListId } = await stored()

    const lists = await listTaskLists()

    expect(lists).toHaveLength(1)
    expect(lists[0]).toMatchObject({ id: taskListId, title: 'Мои задачи', color: '#3b82f6' })
    expect(lists[0].accountEmail).toMatch(/@gmail\.com$/)
  })

  it('погашенный список не предлагается: писать в него уже некуда', async () => {
    const { taskListId } = await stored()
    await db
      .update(googleTaskLists)
      .set({ deletedAt: new Date() })
      .where(eq(googleTaskLists.id, taskListId))

    expect(await listTaskLists()).toHaveLength(0)
  })
})

describe('создание задачи', () => {
  it('заводит задачу в Google и раскладывает ответ Google у себя', async () => {
    const { taskListId } = await stored()
    insertTask.mockResolvedValue(google({ googleTaskId: 't9', title: 'Купить билеты' }))

    const { taskId } = await createTask(taskListId, { title: 'Купить билеты' })

    expect(insertTask).toHaveBeenCalledWith('ya29.access', 'MTIz', { title: 'Купить билеты' })
    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, taskId))
    expect(saved.googleTaskId).toBe('t9')
    expect(saved.title).toBe('Купить билеты')
  })

  it('срок на первое число не уезжает на сутки ни по дороге в Google, ни в базе', async () => {
    const { taskListId } = await stored()
    insertTask.mockResolvedValue(google({ googleTaskId: 't9', due: '2026-03-01' }))

    const { taskId } = await createTask(taskListId, { title: 'Отчёт', due: '2026-03-01' })

    expect(insertTask).toHaveBeenCalledWith('ya29.access', 'MTIz', {
      title: 'Отчёт',
      due: '2026-03-01',
    })
    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, taskId))
    expect(saved.due).toBe('2026-03-01')
  })

  it('срок не датой до Google не доходит', async () => {
    const { taskListId } = await stored()

    await expect(createTask(taskListId, { title: 'Отчёт', due: 'завтра' })).rejects.toBeInstanceOf(
      InvalidInputError,
    )
    expect(insertTask).not.toHaveBeenCalled()
  })

  it('в погашенный список задача не заводится', async () => {
    const { taskListId } = await stored()
    await db
      .update(googleTaskLists)
      .set({ deletedAt: new Date() })
      .where(eq(googleTaskLists.id, taskListId))

    await expect(createTask(taskListId, { title: 'Отчёт' })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('часы задачи внутри дня', () => {
  it('заводятся у себя и в Google не уходят: времени там нет', async () => {
    const { taskListId } = await stored()
    insertTask.mockResolvedValue(google({ googleTaskId: 't-slot', due: '2026-10-01' }))

    const { taskId } = await createTask(taskListId, {
      title: 'Разобрать почту',
      due: '2026-10-01',
      slot: { startTime: '15:00', endTime: '16:00' },
    })

    expect(insertTask).toHaveBeenCalledWith('ya29.access', 'MTIz', {
      title: 'Разобрать почту',
      due: '2026-10-01',
    })
    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, taskId))
    expect(saved.startTime).toBe('15:00:00')
    expect(saved.endTime).toBe('16:00:00')
  })

  it('отдаются на сетку часами без секунд', async () => {
    const { id } = await stored({
      googleTaskId: 't-shown',
      startTime: '15:00',
      endTime: '16:30',
    })

    const [task] = (await listTasks('2026-10-01', '2026-10-01')).filter((one) => one.id === id)

    expect(task).toMatchObject({ startTime: '15:00', endTime: '16:30' })
    expect(await getTask(id)).toMatchObject({ startTime: '15:00', endTime: '16:30' })
  })

  it('правка одних часов в Google не ходит', async () => {
    const { id } = await stored({ googleTaskId: 't-local' })

    const written = await updateTask(id, { slot: { startTime: '09:15', endTime: '10:00' } })

    expect(patchTask).not.toHaveBeenCalled()
    expect(written).toEqual({ taskId: id, conflict: false, goneInGoogle: false })
    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved.startTime).toBe('09:15:00')
  })

  it('перенос по сетке двигает срок в Google и часы у себя одним разом', async () => {
    const { id } = await stored({ googleTaskId: 't-move' })
    patchTask.mockResolvedValue(google({ googleTaskId: 't-move', due: '2026-10-02', etag: '"2"' }))

    await updateTask(id, { due: '2026-10-02', slot: { startTime: '11:00', endTime: '12:00' } })

    expect(patchTask).toHaveBeenCalledWith(
      'ya29.access',
      'MTIz',
      't-move',
      { due: '2026-10-02' },
      '"1"',
    )
    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved).toMatchObject({ due: '2026-10-02', startTime: '11:00:00' })
  })

  it('снятый срок уносит часы за собой: держать их не на чем', async () => {
    const { id } = await stored({ googleTaskId: 't-drop', startTime: '15:00', endTime: '16:00' })
    patchTask.mockResolvedValue(google({ googleTaskId: 't-drop', due: null, etag: '"2"' }))

    await updateTask(id, { due: null })

    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved.startTime).toBeNull()
    expect(saved.endTime).toBeNull()
  })

  it('срок, снятый в Google, тоже стирает часы синхронизацией', async () => {
    const { accountId, taskListId, id } = await stored({
      googleTaskId: 't-sync',
      startTime: '15:00',
      endTime: '16:00',
    })

    await applyTasks(accountId, taskListId, [google({ googleTaskId: 't-sync', due: null })])

    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved.startTime).toBeNull()
  })

  it('вывернутая пара и часы без срока отвергаются', async () => {
    const { id } = await stored({ googleTaskId: 't-bad', due: null })
    const withDue = await stored({ googleTaskId: 't-bad-2' })

    await expect(
      updateTask(withDue.id, { slot: { startTime: '16:00', endTime: '15:00' } }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    await expect(
      updateTask(id, { slot: { startTime: '15:00', endTime: '16:00' } }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    expect(patchTask).not.toHaveBeenCalled()
  })
})

describe('часы и отказ Google', () => {
  it('отказ в записи дня не оставляет часы на новом месте', async () => {
    const { id } = await stored({ googleTaskId: 't-refused', startTime: '15:00', endTime: '16:00' })
    patchTask.mockRejectedValue(new Error('Google отказал'))
    fetchTask.mockResolvedValue(google({ googleTaskId: 't-refused' }))

    await expect(
      updateTask(id, { due: '2026-10-02', slot: { startTime: '11:00', endTime: '12:00' } }),
    ).rejects.toThrow()

    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved).toMatchObject({ due: '2026-10-01', startTime: '15:00:00' })
  })

  it('задача, стёртая в Google из-под нас, часов не получает', async () => {
    const { id } = await stored({ googleTaskId: 't-vanished-slot' })
    patchTask.mockRejectedValue(new TaskEtagMismatchError('устарел', 412))
    fetchTask.mockResolvedValue(null)

    const written = await updateTask(id, {
      due: '2026-10-02',
      slot: { startTime: '11:00', endTime: '12:00' },
    })

    expect(written.goneInGoogle).toBe(true)
    const [saved] = await db.select().from(googleTasks).where(eq(googleTasks.id, id))
    expect(saved.startTime).toBeNull()
  })
})
