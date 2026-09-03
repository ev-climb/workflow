const TASKS_API = 'https://tasks.googleapis.com/tasks/v1'

const PAGE_SIZE = '100'

export type GoogleTaskList = {
  googleTaskListId: string
  title: string
}

export type GoogleTask = {
  googleTaskId: string
  title: string | null
  notes: string | null
  /** Дата без времени: ADR-012, `due` со временем возвращается из Tasks обнулённым. */
  due: string | null
  completed: boolean
  completedAt: Date | null
  etag: string | null
  googleUpdatedAt: Date | null
  webViewLink: string | null
  /** Задача стёрта в Google. Приезжает только с `showDeleted`. */
  deleted: boolean
}

export type TaskPage = {
  tasks: GoogleTask[]
  /** Самый поздний `updated` страницы: от него отсчитывается следующая дельта. */
  latestUpdatedAt: Date | null
}

export class TasksApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Доступа к задачам нет: либо у токена нет области `tasks`, либо Tasks API не включён в
 * проекте Google Cloud. Обе причины приходят кодом 403 и чинятся руками, а не повтором.
 */
export class TasksAccessError extends TasksApiError {}

/** `412`: наш `etag` устарел, задачу успели поправить в Google. Разрешает конфликт сервис. */
export class TaskEtagMismatchError extends TasksApiError {}

type TaskListItem = { id?: string; title?: string }

type TaskItem = {
  id?: string
  etag?: string
  title?: string
  notes?: string
  status?: string
  due?: string
  completed?: string
  updated?: string
  webViewLink?: string
  deleted?: boolean
}

function fail(what: string, status: number, body: string): TasksApiError {
  let reason = ''
  let detail = `код ${status}`
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; errors?: { reason?: string }[] }
    }
    reason = parsed.error?.errors?.[0]?.reason ?? ''
    if (parsed.error?.message) detail = parsed.error.message
  } catch {
    // не JSON — остаётся код ответа
  }

  const message = `Google отказал (${what}): ${detail}`
  if (status === 412) return new TaskEtagMismatchError(message, status)
  if (reason === 'accessNotConfigured') {
    return new TasksAccessError(`${message}. Включи Tasks API в проекте Google Cloud`, status)
  }
  if (reason === 'insufficientPermissions' || status === 401) {
    return new TasksAccessError(`${message}. Переподключи аккаунт: области tasks у токена нет`, status)
  }
  return new TasksApiError(message, status)
}

function moment(value: string | undefined): Date | null {
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * Задача Google в нашу форму. Срок берётся первыми десятью символами строки, а не разбором
 * метки времени: `due` приезжает как `2026-10-01T00:00:00.000Z`, и перевод в московскую
 * дату сдвинул бы срок на сутки (инвариант 3, ADR-012).
 *
 * `hidden` в нашу форму не переносится: это «Google убрал с глаз», а не «выполнена».
 */
export function mapTask(item: TaskItem): GoogleTask | null {
  if (!item.id) return null

  return {
    googleTaskId: item.id,
    title: item.title?.trim() ? item.title : null,
    notes: item.notes ?? null,
    due: item.due ? item.due.slice(0, 10) : null,
    completed: item.status === 'completed',
    completedAt: moment(item.completed),
    etag: item.etag ?? null,
    googleUpdatedAt: moment(item.updated),
    webViewLink: item.webViewLink ?? null,
    deleted: item.deleted === true,
  }
}

async function read(what: string, url: URL, accessToken: string): Promise<unknown> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  const body = await response.text()
  if (!response.ok) throw fail(what, response.status, body)
  return JSON.parse(body)
}

/** Списки задач аккаунта целиком. Дельта даётся по списку, поэтому проход начинается с них. */
export async function fetchTaskLists(accessToken: string): Promise<GoogleTaskList[]> {
  const lists: GoogleTaskList[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${TASKS_API}/users/@me/lists`)
    url.searchParams.set('maxResults', PAGE_SIZE)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const page = (await read('списки задач', url, accessToken)) as {
      items?: TaskListItem[]
      nextPageToken?: string
    }
    for (const item of page.items ?? []) {
      if (!item.id) continue
      lists.push({ googleTaskListId: item.id, title: item.title ?? item.id })
    }

    pageToken = page.nextPageToken
  } while (pageToken)

  return lists
}

/**
 * Задачи списка. Без `updatedMin` — весь список, с ним — дельта: `syncToken` в Tasks нет
 * (ADR-012). Все три флага стоят всегда: без `showHidden` выполненная задача пропадёт из
 * выдачи и станет неотличима от удалённой, а без `showDeleted` мы не узнаем о стирании.
 */
export async function fetchTasks(
  accessToken: string,
  googleTaskListId: string,
  updatedMin: Date | null,
): Promise<TaskPage> {
  const tasks: GoogleTask[] = []
  let latestUpdatedAt: Date | null = null
  let pageToken: string | undefined

  do {
    const url = new URL(`${TASKS_API}/lists/${encodeURIComponent(googleTaskListId)}/tasks`)
    url.searchParams.set('maxResults', PAGE_SIZE)
    url.searchParams.set('showCompleted', 'true')
    url.searchParams.set('showHidden', 'true')
    url.searchParams.set('showDeleted', 'true')
    if (updatedMin) url.searchParams.set('updatedMin', updatedMin.toISOString())
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const page = (await read('задачи списка', url, accessToken)) as {
      items?: TaskItem[]
      nextPageToken?: string
    }
    for (const item of page.items ?? []) {
      const task = mapTask(item)
      if (!task) continue
      tasks.push(task)
      if (task.googleUpdatedAt && (!latestUpdatedAt || task.googleUpdatedAt > latestUpdatedAt)) {
        latestUpdatedAt = task.googleUpdatedAt
      }
    }

    pageToken = page.nextPageToken
  } while (pageToken)

  return { tasks, latestUpdatedAt }
}

/** Правка задачи: поле отсутствует — не трогаем, `null` — стираем. */
export type TaskPatch = {
  title?: string | null
  notes?: string | null
  /** Дата вида `2026-10-01`; `null` снимает срок. */
  due?: string | null
  completed?: boolean
}

function patchBody(patch: TaskPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if ('title' in patch) body.title = patch.title ?? ''
  if ('notes' in patch) body.notes = patch.notes
  // голую дату Tasks отвергает четырёхсотым: срок посылается полным RFC3339 с нулевым
  // временем, и Google возвращает его в том же виде (ADR-012)
  if ('due' in patch) body.due = patch.due ? `${patch.due}T00:00:00.000Z` : null
  if (patch.completed !== undefined) {
    body.status = patch.completed ? 'completed' : 'needsAction'
    // снятие отметки не стирает момент выполнения само: задача осталась бы выполненной
    // по одному полю и открытой по другому
    if (!patch.completed) body.completed = null
  }
  return body
}

function taskUrl(googleTaskListId: string, googleTaskId: string): string {
  return `${TASKS_API}/lists/${encodeURIComponent(googleTaskListId)}/tasks/${encodeURIComponent(googleTaskId)}`
}

// кириллица в значении заголовка роняет сам fetch, до Google не доходя: etag Google
// латинский, но проверять дешевле, чем ловить падение записи на чужом значении
function ifMatch(etag: string | null): Record<string, string> {
  return etag && /^[\x20-\x7e]*$/.test(etag) ? { 'if-match': etag } : {}
}

/** Одна задача. `null` — Google о такой не знает: её стёрли насовсем. */
export async function fetchTask(
  accessToken: string,
  googleTaskListId: string,
  googleTaskId: string,
): Promise<GoogleTask | null> {
  const response = await fetch(taskUrl(googleTaskListId, googleTaskId), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const body = await response.text()
  if (response.status === 404) return null
  if (!response.ok) throw fail('задача', response.status, body)

  return mapTask(JSON.parse(body) as TaskItem)
}

/**
 * Запись обратно: `PATCH` с `If-Match`. Устаревший `etag` даёт `412` — разрешение конфликта
 * не здесь, а в сервисе. Проверено разведкой: запись не слепая, схема защиты от затирания
 * та же, что у событий.
 */
export async function patchTask(
  accessToken: string,
  googleTaskListId: string,
  googleTaskId: string,
  patch: TaskPatch,
  etag: string | null,
): Promise<GoogleTask> {
  const response = await fetch(taskUrl(googleTaskListId, googleTaskId), {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...ifMatch(etag),
    },
    body: JSON.stringify(patchBody(patch)),
  })
  const body = await response.text()
  if (!response.ok) throw fail('правка задачи', response.status, body)

  const task = mapTask(JSON.parse(body) as TaskItem)
  if (!task) throw new TasksApiError('Google вернул задачу без идентификатора', response.status)
  return task
}
