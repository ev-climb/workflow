// Одноразовый скрипт разведки Google Tasks API — фаза 06, .docs/phases/06-zadachi-google.md.
// Будет выброшен вместе с закрытием фазы. Токены берёт из аккаунтов, уже подключённых в
// базе, поэтому перед запуском оба аккаунта надо переподключить: области доступа к Tasks
// у выданных раньше refresh-токенов нет.
//
//   node scripts/spike-tasks.ts <команда>
//
// Опыты на запись заводят свои данные во временных списках с известным названием и
// убирают их за собой; если запуск упал на середине — node scripts/spike-tasks.ts cleanup.

import './load-env.ts'
import {
  type GoogleAccountSummary,
  accessTokenFor,
  listGoogleAccounts,
} from '../src/server/services/google-accounts.ts'

const API = 'https://tasks.googleapis.com/tasks/v1'

/** По этой приставке в названии узнаются списки, заведённые разведкой. */
const TEMP_PREFIX = 'спайк-разведка'

type TaskList = { id: string; title: string; updated: string; etag?: string }

type Task = {
  id: string
  etag?: string
  title?: string
  status?: string
  due?: string
  completed?: string
  updated?: string
  notes?: string
  parent?: string
  position?: string
  hidden?: boolean
  deleted?: boolean
  webViewLink?: string
}

type ListFlags = {
  showCompleted?: boolean
  showHidden?: boolean
  showDeleted?: boolean
  updatedMin?: string
}

class TasksApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string, url: string) {
    super(`${status} на ${url}: ${body.slice(0, 400)}`)
    this.status = status
    this.body = body
  }
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`)
  process.exit(1)
}

async function tapi<T>(
  accountId: string,
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init
  const url = new URL(API + path)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value)
  }

  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(rest.headers as Record<string, string> | undefined),
      authorization: `Bearer ${await accessTokenFor(accountId)}`,
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  const body = await res.text()
  if (!res.ok) throw new TasksApiError(res.status, body, url.pathname + url.search)
  return (body ? JSON.parse(body) : undefined) as T
}

/** Ответ вместе с кодом: в опытах на запись сам код и есть результат. */
async function traw(
  accountId: string,
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<{ status: number; body: string; json: unknown }> {
  const { query, ...rest } = init
  const url = new URL(API + path)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value)
  }

  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(rest.headers as Record<string, string> | undefined),
      authorization: `Bearer ${await accessTokenFor(accountId)}`,
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  const body = await res.text()
  let json: unknown
  try {
    json = body ? JSON.parse(body) : undefined
  } catch {
    json = undefined
  }
  return { status: res.status, body, json }
}

function flagQuery(flags: ListFlags): Record<string, string | undefined> {
  return {
    maxResults: '100',
    showCompleted: flags.showCompleted === undefined ? undefined : String(flags.showCompleted),
    showHidden: flags.showHidden === undefined ? undefined : String(flags.showHidden),
    showDeleted: flags.showDeleted === undefined ? undefined : String(flags.showDeleted),
    updatedMin: flags.updatedMin,
  }
}

async function taskLists(accountId: string): Promise<TaskList[]> {
  const page = await tapi<{ items?: TaskList[] }>(accountId, '/users/@me/lists', {
    query: { maxResults: '100' },
  })
  return page.items ?? []
}

async function tasksOf(accountId: string, listId: string, flags: ListFlags = {}): Promise<Task[]> {
  const page = await tapi<{ items?: Task[] }>(accountId, `/lists/${listId}/tasks`, {
    query: flagQuery(flags),
  })
  return page.items ?? []
}

async function accounts(pick?: string): Promise<GoogleAccountSummary[]> {
  const all = await listGoogleAccounts()
  if (all.length === 0) fail('в базе нет подключённых аккаунтов Google — подключи их на /settings')
  const chosen = pick ? all.filter((a) => a.email.includes(pick)) : all
  if (chosen.length === 0) fail(`нет аккаунта, в почте которого есть «${pick}»`)
  return chosen
}

/** Аккаунт для опытов на запись: первый живой, если не выбран явно. */
async function writeAccount(pick?: string): Promise<GoogleAccountSummary> {
  const usable = (await accounts(pick)).filter((a) => !a.needsReauth)
  if (usable.length === 0) fail('все аккаунты помечены needs_reauth — переподключи их на /settings')
  return usable[0]!
}

async function makeTempList(accountId: string, suffix: string): Promise<TaskList> {
  return tapi<TaskList>(accountId, '/users/@me/lists', {
    method: 'POST',
    body: JSON.stringify({ title: `${TEMP_PREFIX} ${suffix}` }),
  })
}

async function dropTempList(accountId: string, listId: string): Promise<void> {
  try {
    await tapi(accountId, `/users/@me/lists/${listId}`, { method: 'DELETE' })
  } catch (error) {
    console.error(`  ! временный список ${listId} не удалился: ${(error as Error).message}`)
  }
}

async function addTask(accountId: string, listId: string, body: Record<string, unknown>) {
  return tapi<Task>(accountId, `/lists/${listId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function dump(label: string, value: unknown): void {
  console.log(`  ${label}:`)
  console.log(
    JSON.stringify(value, null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
  )
}

function short(task: Task): string {
  const bits = [
    task.status === 'completed' ? 'выполнена' : 'открыта',
    task.due ? `срок ${task.due}` : 'без срока',
  ]
  if (task.parent) bits.push('подзадача')
  if (task.hidden) bits.push('hidden')
  if (task.deleted) bits.push('deleted')
  return `${task.title || '(без названия)'} — ${bits.join(', ')}`
}

/** Метка для updatedMin по серверным часам: наши могут разойтись с гугловскими. */
function plusMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString()
}

/** Две причины отказа выглядят одинаково, а чинятся по-разному — различаем по reason. */
function adviceFor(error: TasksApiError): string | null {
  let reason = ''
  let message = ''
  try {
    const parsed = JSON.parse(error.body) as {
      error?: { message?: string; errors?: { reason?: string }[] }
    }
    reason = parsed.error?.errors?.[0]?.reason ?? ''
    message = parsed.error?.message ?? ''
  } catch {
    reason = ''
  }
  if (reason === 'accessNotConfigured') {
    const link = message.match(/https:\/\/console\.developers\.google\.com\S+?(?=\s|$)/)?.[0]
    return `Tasks API не включён в проекте Google Cloud${link ? `: включи его на ${link}` : ''}`
  }
  if (reason === 'insufficientPermissions' || error.status === 401) {
    return 'области доступа к задачам у токена нет: переподключи аккаунт на /settings'
  }
  return null
}

async function cmdAccounts(pick?: string): Promise<void> {
  console.log('\nАккаунты и доступ к Tasks\n')
  for (const account of await accounts(pick)) {
    const mark = account.needsReauth ? ' (needs_reauth)' : ''
    try {
      const lists = await taskLists(account.id)
      console.log(`  ${account.email}${mark}: доступ есть, списков ${lists.length}`)
    } catch (error) {
      const status = error instanceof TasksApiError ? error.status : '—'
      console.log(`  ${account.email}${mark}: отказ ${status}`)
      console.log(`    ${(error as Error).message}`)
      const advice = error instanceof TasksApiError ? adviceFor(error) : null
      if (advice) console.log(`    ${advice}`)
    }
  }
  console.log()
}

async function cmdLists(pick?: string): Promise<void> {
  console.log('\nСписки задач — сырой ответ users/@me/lists\n')
  for (const account of await accounts(pick)) {
    console.log(`  ${account.email}`)
    const page = await tapi<unknown>(account.id, '/users/@me/lists', { query: { maxResults: '100' } })
    dump('ответ', page)
    console.log()
  }
}

async function cmdTasks(pick?: string): Promise<void> {
  console.log('\nЗадачи всех списков — сырой ответ с showCompleted, showHidden и showDeleted\n')
  for (const account of await accounts(pick)) {
    for (const list of await taskLists(account.id)) {
      console.log(`  ${account.email} · ${list.title} (${list.id})`)
      const page = await tapi<unknown>(account.id, `/lists/${list.id}/tasks`, {
        query: flagQuery({ showCompleted: true, showHidden: true, showDeleted: true }),
      })
      dump('ответ', page)
      console.log()
    }
  }
}

/** Пять случаев из задания фазы: форму каждого надо увидеть глазами и записать в журнал. */
async function cmdSamples(pick?: string): Promise<void> {
  console.log('\nПять случаев из задания фазы — по одному живому примеру на каждый\n')

  const buckets: { key: string; label: string; hit: (t: Task) => boolean; found?: Task; where?: string }[] = [
    { key: 'plain', label: 'задача без срока', hit: (t) => !t.due && !t.parent && t.status !== 'completed' },
    { key: 'due', label: 'задача со сроком', hit: (t) => Boolean(t.due) && !t.parent },
    {
      key: 'time',
      label: 'задача со сроком и временем, выставленным в интерфейсе Google',
      hit: (t) => Boolean(t.due) && !/T00:00:00(\.000)?Z$/.test(t.due ?? ''),
    },
    { key: 'done', label: 'выполненная задача', hit: (t) => t.status === 'completed' },
    { key: 'child', label: 'подзадача', hit: (t) => Boolean(t.parent) },
  ]

  for (const account of await accounts(pick)) {
    for (const list of await taskLists(account.id)) {
      const items = await tasksOf(account.id, list.id, {
        showCompleted: true,
        showHidden: true,
        showDeleted: true,
      })
      for (const bucket of buckets) {
        if (bucket.found) continue
        const hit = items.find((t) => bucket.hit(t))
        if (hit) {
          bucket.found = hit
          bucket.where = `${account.email} · ${list.title}`
        }
      }
    }
  }

  for (const bucket of buckets) {
    if (!bucket.found) {
      console.log(`  ${bucket.label}: не нашлось — заведи такую в Google и повтори`)
      console.log()
      continue
    }
    console.log(`  ${bucket.label} — ${bucket.where}`)
    dump('сырой JSON', bucket.found)
    console.log()
  }
}

/** Что видно без флагов и что добавляет каждый из них. */
async function cmdFlags(pick?: string): Promise<void> {
  console.log('\nshowCompleted, showHidden, showDeleted — что каждый из них добавляет\n')

  const combos: { label: string; flags: ListFlags }[] = [
    { label: 'без флагов вовсе', flags: {} },
    { label: 'showCompleted=false', flags: { showCompleted: false } },
    { label: 'showCompleted=true', flags: { showCompleted: true } },
    { label: 'showCompleted=true, showHidden=true', flags: { showCompleted: true, showHidden: true } },
    {
      label: 'showCompleted=true, showHidden=true, showDeleted=true',
      flags: { showCompleted: true, showHidden: true, showDeleted: true },
    },
  ]

  for (const account of await accounts(pick)) {
    for (const list of await taskLists(account.id)) {
      console.log(`  ${account.email} · ${list.title}`)
      let previous: Set<string> | null = null
      for (const combo of combos) {
        const items = await tasksOf(account.id, list.id, combo.flags)
        const ids = new Set(items.map((t) => t.id))
        const added = previous ? [...ids].filter((id) => !previous!.has(id)) : []
        const gone = previous ? [...previous].filter((id) => !ids.has(id)) : []
        const delta = previous
          ? ` (+${added.length}, −${gone.length})`
          : ''
        console.log(`    ${combo.label}: ${items.length}${delta}`)
        for (const id of added) {
          const task = items.find((t) => t.id === id)!
          console.log(`      + ${short(task)}`)
        }
        previous = ids
      }
      console.log()
    }
  }
}

/** Приходит ли в due время или только дата — и что случается с датой первого числа. */
async function cmdDue(pick?: string): Promise<void> {
  console.log('\nПоле due: дата или метка времени\n')
  const account = await writeAccount(pick)
  console.log(`  аккаунт ${account.email}`)
  const list = await makeTempList(account.id, 'due')
  try {
    const cases: { label: string; due: string }[] = [
      { label: 'полночь UTC первого числа', due: '2026-10-01T00:00:00.000Z' },
      { label: 'середина дня', due: '2026-10-01T15:30:00.000Z' },
      { label: 'вечер по Москве, записанный в UTC', due: '2026-10-01T21:00:00.000Z' },
      { label: 'только дата, без времени вовсе', due: '2026-10-01' },
    ]
    for (const { label, due } of cases) {
      const res = await traw(account.id, `/lists/${list.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title: `срок: ${label}`, due }),
      })
      console.log(`\n  отправили due=${due} — ${label}`)
      if (res.status >= 400) {
        console.log(`    отказ ${res.status}: ${res.body.slice(0, 300)}`)
        continue
      }
      const created = res.json as Task
      console.log(`    вернулось due=${created.due ?? '(пусто)'}`)
      const read = await tapi<Task>(account.id, `/lists/${list.id}/tasks/${created.id}`)
      console.log(`    перечитали  due=${read.due ?? '(пусто)'}`)
      dump('сырой JSON', read)
    }
  } finally {
    await dropTempList(account.id, list.id)
    console.log('\n  временный список убран\n')
  }
}

/** Работает ли updatedMin как дельта: правка, выполнение и удаление обязаны в неё попасть. */
async function cmdDelta(pick?: string): Promise<void> {
  console.log('\nupdatedMin вместо syncToken: попадают ли в дельту правка, выполнение и удаление\n')
  const account = await writeAccount(pick)
  console.log(`  аккаунт ${account.email}`)
  const list = await makeTempList(account.id, 'delta')
  try {
    const edited = await addTask(account.id, list.id, { title: 'дельта: правка' })
    const done = await addTask(account.id, list.id, { title: 'дельта: выполнение' })
    const removed = await addTask(account.id, list.id, { title: 'дельта: удаление' })
    const untouched = await addTask(account.id, list.id, { title: 'дельта: нетронутая' })

    const created = [edited, done, removed, untouched]
    const latest = created
      .map((t) => t.updated ?? '')
      .filter(Boolean)
      .sort()
      .at(-1)
    if (!latest) fail('в ответе на создание нет поля updated — дельту строить не на чем')
    const mark = plusMs(latest, 1)
    console.log(`  метка дельты по серверным часам: ${mark}`)

    await tapi(account.id, `/lists/${list.id}/tasks/${edited.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'дельта: правка (переименована)' }),
    })
    await tapi(account.id, `/lists/${list.id}/tasks/${done.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
    })
    await tapi(account.id, `/lists/${list.id}/tasks/${removed.id}`, { method: 'DELETE' })

    const names = new Map([
      [edited.id, 'правка'],
      [done.id, 'выполнение'],
      [removed.id, 'удаление'],
      [untouched.id, 'нетронутая'],
    ])

    const combos: { label: string; flags: ListFlags }[] = [
      { label: 'updatedMin без флагов', flags: {} },
      { label: 'updatedMin + showCompleted, showHidden', flags: { showCompleted: true, showHidden: true } },
      {
        label: 'updatedMin + showCompleted, showHidden, showDeleted',
        flags: { showCompleted: true, showHidden: true, showDeleted: true },
      },
    ]

    for (const combo of combos) {
      const items = await tasksOf(account.id, list.id, { ...combo.flags, updatedMin: mark })
      const got = items.map((t) => names.get(t.id) ?? t.id)
      console.log(`\n  ${combo.label}: пришло ${items.length} — ${got.join(', ') || 'ничего'}`)
      for (const task of items) {
        console.log(`    ${names.get(task.id) ?? task.id}: ${short(task)}`)
      }
      const missing = [...names.entries()]
        .filter(([id, name]) => name !== 'нетронутая' && !items.some((t) => t.id === id))
        .map(([, name]) => name)
      if (missing.length > 0) console.log(`    в дельту НЕ попало: ${missing.join(', ')}`)
      if (items.some((t) => t.id === untouched.id)) {
        console.log('    нетронутая тоже приехала — значит, updatedMin отсекает не так, как мы думали')
      }
    }
  } finally {
    await dropTempList(account.id, list.id)
    console.log('\n  временный список убран\n')
  }
}

/** Слепая ли запись: уважает ли PATCH заголовок If-Match с etag. */
async function cmdEtag(pick?: string): Promise<void> {
  console.log('\nIf-Match у PATCH: защищает ли etag от затирания чужой правки\n')
  const account = await writeAccount(pick)
  console.log(`  аккаунт ${account.email}`)
  const list = await makeTempList(account.id, 'etag')
  try {
    const task = await addTask(account.id, list.id, { title: 'etag: исходная' })
    console.log(`  etag при создании: ${task.etag ?? '(поля нет вовсе)'}`)

    const fresh = await tapi<Task>(account.id, `/lists/${list.id}/tasks/${task.id}`)
    const stale = fresh.etag
    console.log(`  etag при чтении:   ${stale ?? '(поля нет вовсе)'}`)

    const first = await traw(account.id, `/lists/${list.id}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: stale ? { 'if-match': stale } : {},
      body: JSON.stringify({ title: 'etag: правка со свежим etag' }),
    })
    console.log(`\n  1. PATCH со свежим etag: ${first.status}`)
    if (first.status >= 400) console.log(`     ${first.body.slice(0, 300)}`)

    const second = await traw(account.id, `/lists/${list.id}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: stale ? { 'if-match': stale } : {},
      body: JSON.stringify({ title: 'etag: правка с устаревшим etag' }),
    })
    console.log(`  2. PATCH с тем же, уже устаревшим etag: ${second.status}`)
    if (second.status >= 400) console.log(`     ${second.body.slice(0, 300)}`)

    const bogus = await traw(account.id, `/lists/${list.id}/tasks/${task.id}`, {
      method: 'PATCH',
      // заголовок только ASCII: кириллица в If-Match роняет сам fetch, до Google не доходит
      headers: { 'if-match': '"no-such-etag"' },
      body: JSON.stringify({ title: 'etag: правка с выдуманным etag' }),
    })
    console.log(`  3. PATCH с выдуманным etag: ${bogus.status}`)
    if (bogus.status >= 400) console.log(`     ${bogus.body.slice(0, 300)}`)

    const after = await tapi<Task>(account.id, `/lists/${list.id}/tasks/${task.id}`)
    console.log(`\n  осталось: «${after.title}»`)
    console.log(
      second.status < 400
        ? '  вывод: устаревший etag записи не мешает — запись слепая, конфликт ловить нечем'
        : `  вывод: устаревший etag отвергается (${second.status}) — можно повторить схему из событий`,
    )
  } finally {
    await dropTempList(account.id, list.id)
    console.log('\n  временный список убран\n')
  }
}

/** Что с задачей, у которой сменили список: тот же id или новая строка. */
async function cmdMove(pick?: string): Promise<void> {
  console.log('\nСмена списка: переживает ли задача переезд со своим id\n')
  const account = await writeAccount(pick)
  console.log(`  аккаунт ${account.email}`)
  let from: TaskList | null = null
  let to: TaskList | null = null
  try {
    from = await makeTempList(account.id, 'откуда')
    to = await makeTempList(account.id, 'куда')
    const task = await addTask(account.id, from.id, { title: 'переезд', due: '2026-10-01T00:00:00.000Z' })
    console.log(`  завели ${task.id} в списке «${from.title}»`)
    const mark = task.updated ? plusMs(task.updated, 1) : undefined

    const moved = await traw(account.id, `/lists/${from.id}/tasks/${task.id}/move`, {
      method: 'POST',
      query: { destinationTasklist: to.id },
    })
    console.log(`\n  POST .../move?destinationTasklist=…: ${moved.status}`)
    if (moved.status >= 400) {
      console.log(`    ${moved.body.slice(0, 400)}`)
      console.log('    переезд между списками через API не прошёл — перенеси задачу руками в Google')
      console.log('    и сравни: она осталась с тем же id или завелась новой строкой')
    } else {
      dump('ответ', moved.json)
    }

    for (const list of [from, to]) {
      const items = await tasksOf(account.id, list.id, {
        showCompleted: true,
        showHidden: true,
        showDeleted: true,
      })
      const hit = items.find((t) => t.id === task.id)
      console.log(
        `\n  «${list.title}»: задач ${items.length}, исходный id ${hit ? 'на месте' : 'не найден'}`,
      )
      for (const item of items) console.log(`    ${item.id}: ${short(item)}`)
    }

    // от этого зависит механизм догона: если в дельте исходного списка следа нет,
    // переехавшая задача останется висеть у нас навсегда
    if (mark) {
      const delta = await tasksOf(account.id, from.id, {
        showCompleted: true,
        showHidden: true,
        showDeleted: true,
        updatedMin: mark,
      })
      const trace = delta.find((t) => t.id === task.id)
      console.log(`\n  дельта исходного списка с updatedMin: пришло ${delta.length}`)
      console.log(
        trace
          ? `    след переехавшей есть: ${short(trace)}`
          : '    следа переехавшей НЕТ — по одному списку переезд не виден, догонять придётся иначе',
      )
    }
  } finally {
    if (from) await dropTempList(account.id, from.id)
    if (to) await dropTempList(account.id, to.id)
    console.log('\n  временные списки убраны\n')
  }
}

async function cmdCleanup(pick?: string): Promise<void> {
  console.log(`\nУборка списков с приставкой «${TEMP_PREFIX}»\n`)
  for (const account of await accounts(pick)) {
    if (account.needsReauth) continue
    const temp = (await taskLists(account.id)).filter((l) => l.title.startsWith(TEMP_PREFIX))
    if (temp.length === 0) {
      console.log(`  ${account.email}: убирать нечего`)
      continue
    }
    for (const list of temp) {
      await dropTempList(account.id, list.id)
      console.log(`  ${account.email}: удалён «${list.title}»`)
    }
  }
  console.log()
}

const USAGE = `
  node scripts/spike-tasks.ts <команда> [часть почты аккаунта]

    accounts    видят ли подключённые аккаунты Tasks API — первое, что стоит запустить
                после переподключения: отказ 403 значит, что новая область не приехала
    lists       сырой ответ users/@me/lists по каждому аккаунту
    tasks       сырой ответ со всеми задачами каждого списка
    samples     пять случаев из задания фазы: без срока, со сроком, со сроком и временем,
                выполненная, подзадача — по живому примеру на каждый
    flags       что видно без флагов и что добавляет каждый из showCompleted,
                showHidden, showDeleted
    due         приходит ли в due время или только дата, и не уезжает ли первое число
    delta       годится ли updatedMin вместо syncToken: попадают ли в дельту правка,
                выполнение и удаление
    etag        уважает ли PATCH заголовок If-Match или запись слепая
    move        что с задачей, у которой сменили список
    cleanup     убрать временные списки, если предыдущий запуск упал на середине

  Команды due, delta, etag и move заводят свои данные во временных списках и удаляют их
  за собой; чужих задач не трогают.
`

const [command, pick] = process.argv.slice(2)
const commands: Record<string, () => Promise<void>> = {
  accounts: () => cmdAccounts(pick),
  lists: () => cmdLists(pick),
  tasks: () => cmdTasks(pick),
  samples: () => cmdSamples(pick),
  flags: () => cmdFlags(pick),
  due: () => cmdDue(pick),
  delta: () => cmdDelta(pick),
  etag: () => cmdEtag(pick),
  move: () => cmdMove(pick),
  cleanup: () => cmdCleanup(pick),
}

const run = command ? commands[command] : undefined
if (!run) {
  console.log(USAGE)
  process.exit(command ? 1 : 0)
}

try {
  await run()
  process.exit(0)
} catch (error) {
  if (process.env.SPIKE_DEBUG) console.error(error)
  fail(error instanceof Error ? error.message : String(error))
}
