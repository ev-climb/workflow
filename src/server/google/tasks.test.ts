import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TaskEtagMismatchError,
  TasksAccessError,
  TasksApiError,
  fetchTaskLists,
  fetchTasks,
  mapTask,
  patchTask,
} from './tasks.ts'

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function refusal(reason: string, status = 403): Response {
  return answer({ error: { message: 'нет доступа', errors: [{ reason }] } }, status)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('разбор задачи', () => {
  it('срок остаётся датой и не превращается в момент', () => {
    const task = mapTask({ id: 't1', title: 'Купить билеты', due: '2026-10-01T00:00:00.000Z' })

    expect(task?.due).toBe('2026-10-01')
  })

  it('срок на первое число не уезжает на сутки', () => {
    const task = mapTask({ id: 't1', due: '2026-03-01T00:00:00.000Z' })

    expect(task?.due).toBe('2026-03-01')
  })

  it('время, выставленное в интерфейсе Google, в сроке не живёт: берём дату как строку', () => {
    const task = mapTask({ id: 't1', due: '2026-10-01T15:30:00.000Z' })

    expect(task?.due).toBe('2026-10-01')
  })

  it('задача без срока приходит без него, а не с пустой строкой', () => {
    const task = mapTask({ id: 't1', title: 'Когда-нибудь' })

    expect(task?.due).toBeNull()
  })

  it('выполнение читается по status: hidden в нашу форму не переносится вовсе', () => {
    const done = mapTask({ id: 't1', status: 'completed', completed: '2026-09-03T08:00:00.000Z' })
    const open = mapTask({ id: 't2', status: 'needsAction' })

    expect(done).toMatchObject({ completed: true, completedAt: new Date('2026-09-03T08:00:00.000Z') })
    expect(open).toMatchObject({ completed: false, completedAt: null })
    expect(open && 'hidden' in open).toBe(false)
  })

  it('стёртая задача приходит с признаком, а не пропадает из разбора', () => {
    const task = mapTask({ id: 't1', deleted: true })

    expect(task).toMatchObject({ googleTaskId: 't1', deleted: true })
  })

  it('пустой заголовок — это отсутствие заголовка', () => {
    expect(mapTask({ id: 't1', title: '' })?.title).toBeNull()
    expect(mapTask({ id: 't1', title: '   ' })?.title).toBeNull()
  })

  it('негодный updated не роняет разбор', () => {
    expect(mapTask({ id: 't1', updated: 'позавчера' })?.googleUpdatedAt).toBeNull()
  })

  it('задача без идентификатора не разбирается', () => {
    expect(mapTask({ title: 'ничья' })).toBeNull()
  })
})

describe('выборка задач', () => {
  it('идёт со всеми тремя флагами: без них выполненная неотличима от удалённой', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTasks('ya29.access', 'MTIz', null)

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('showCompleted')).toBe('true')
    expect(url.searchParams.get('showHidden')).toBe('true')
    expect(url.searchParams.get('showDeleted')).toBe('true')
    expect(url.searchParams.has('updatedMin')).toBe(false)
  })

  it('с меткой идёт дельтой', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTasks('ya29.access', 'MTIz', new Date('2026-09-03T08:00:00.000Z'))

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('updatedMin')).toBe('2026-09-03T08:00:00.000Z')
  })

  it('отдаёт самый поздний updated страницы: от него пойдёт следующая дельта', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        answer({
          items: [
            { id: 't1', updated: '2026-09-03T08:00:00.000Z' },
            { id: 't2', updated: '2026-09-03T09:30:00.000Z' },
            { id: 't3', updated: '2026-09-03T07:00:00.000Z' },
          ],
        }),
      ),
    )

    const page = await fetchTasks('ya29.access', 'MTIz', null)

    expect(page.tasks).toHaveLength(3)
    expect(page.latestUpdatedAt).toEqual(new Date('2026-09-03T09:30:00.000Z'))
  })

  it('собирает страницы по nextPageToken', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer({ items: [{ id: 't1' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(answer({ items: [{ id: 't2' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await fetchTasks('ya29.access', 'MTIz', null)

    expect(page.tasks.map((task) => task.googleTaskId)).toEqual(['t1', 't2'])
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('pageToken')).toBe('p2')
  })

  it('списки задач берут название, а не идентификатор', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(answer({ items: [{ id: 'MTIz', title: 'Мои задачи' }, { title: 'без id' }] })),
    )

    expect(await fetchTaskLists('ya29.access')).toEqual([
      { googleTaskListId: 'MTIz', title: 'Мои задачи' },
    ])
  })
})

describe('отказы Tasks API', () => {
  it('нехватка области доступа отличается от прочих отказов', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refusal('insufficientPermissions')))

    await expect(fetchTaskLists('ya29.access')).rejects.toBeInstanceOf(TasksAccessError)
  })

  it('выключенный в Cloud API приходит тем же кодом и тоже чинится руками', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refusal('accessNotConfigured')))

    await expect(fetchTaskLists('ya29.access')).rejects.toBeInstanceOf(TasksAccessError)
  })

  it('прочий отказ остаётся обычной ошибкой', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refusal('backendError', 500)))

    const error = await fetchTaskLists('ya29.access').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(TasksApiError)
    expect(error).not.toBeInstanceOf(TasksAccessError)
  })
})

describe('запись задачи', () => {
  it('срок уходит полным RFC3339: голую дату Tasks отвергает', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 't1' }))
    vi.stubGlobal('fetch', fetchMock)

    await patchTask('ya29.access', 'MTIz', 't1', { due: '2026-10-01' }, '"etag"')

    const init = fetchMock.mock.calls[0][1] as { body: string; headers: Record<string, string> }
    expect(JSON.parse(init.body)).toEqual({ due: '2026-10-01T00:00:00.000Z' })
    expect(init.headers['if-match']).toBe('"etag"')
  })

  it('снятый срок стирается, а не пропускается', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 't1' }))
    vi.stubGlobal('fetch', fetchMock)

    await patchTask('ya29.access', 'MTIz', 't1', { due: null }, null)

    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({ due: null })
  })

  it('снятие отметки гасит и момент выполнения', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 't1' }))
    vi.stubGlobal('fetch', fetchMock)

    await patchTask('ya29.access', 'MTIz', 't1', { completed: false }, null)

    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      status: 'needsAction',
      completed: null,
    })
  })

  it('отметка выполнения посылает один status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 't1', status: 'completed' }))
    vi.stubGlobal('fetch', fetchMock)

    const task = await patchTask('ya29.access', 'MTIz', 't1', { completed: true }, null)

    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      status: 'completed',
    })
    expect(task.completed).toBe(true)
  })

  it('etag с кириллицей в заголовок не идёт: fetch на нём падает, до Google не доходя', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ id: 't1' }))
    vi.stubGlobal('fetch', fetchMock)

    await patchTask('ya29.access', 'MTIz', 't1', { title: 'Новое' }, '"этаг"')

    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers['if-match']).toBeUndefined()
  })

  it('устаревший etag отличается от прочих отказов', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refusal('conditionNotMet', 412)))

    await expect(
      patchTask('ya29.access', 'MTIz', 't1', { completed: true }, '"old"'),
    ).rejects.toBeInstanceOf(TaskEtagMismatchError)
  })
})
