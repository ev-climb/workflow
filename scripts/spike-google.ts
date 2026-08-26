// Одноразовый скрипт разведки Google Calendar API — фаза 01, .docs/phases/01-google-razvedka.md.
// Будет выброшен вместе с закрытием фазы. Ни базы, ни Next.js, ни шифрования токенов:
// проверяем только то, что снаружи нас может удивить.
//
//   node scripts/spike-google.ts <команда>
//
// Требуется Node >= 22.18 (сам исполняет TypeScript). Токены складываются в
// scripts/.spike-tokens.json — файл в .gitignore, в логи не попадает.

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const TOKENS_PATH = fileURLToPath(new URL('.spike-tokens.json', import.meta.url))

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ')

const API = 'https://www.googleapis.com/calendar/v3'
const TZ = 'Europe/Moscow'

type Account = {
  email: string
  refreshToken: string
  accessToken: string
  expiresAt: number
  scope: string
  connectedAt: string
  lastRefreshAt: string | null
  syncTokens: Record<string, string>
}

type Store = { accounts: Account[] }

type GoogleDate = { date?: string; dateTime?: string; timeZone?: string }

type GoogleEvent = {
  id: string
  etag: string
  status?: string
  summary?: string
  start?: GoogleDate
  end?: GoogleDate
  recurringEventId?: string
  organizer?: { email?: string; self?: boolean }
  htmlLink?: string
}

type CalendarListEntry = {
  id: string
  summary?: string
  primary?: boolean
  accessRole?: string
  selected?: boolean
}

class GoogleApiError extends Error {
  status: number
  body: string

  constructor(status: number, body: string, url: string) {
    super(`${status} на ${url}: ${body.slice(0, 400)}`)
    this.status = status
    this.body = body
  }
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    fail(`не задана переменная ${name} — заполни .env (см. .env.example)`)
  }
  return value
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`)
  process.exit(1)
}

function loadStore(): Store {
  if (!existsSync(TOKENS_PATH)) return { accounts: [] }
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf8')) as Store
}

function saveStore(store: Store): void {
  writeFileSync(TOKENS_PATH, JSON.stringify(store, null, 2), { mode: 0o600 })
}

function requireAccounts(): { store: Store; accounts: Account[] } {
  const store = loadStore()
  if (store.accounts.length === 0) {
    fail('нет подключённых аккаунтов: сначала node scripts/spike-google.ts auth')
  }
  return { store, accounts: store.accounts }
}

function authUrl(state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env('GOOGLE_CLIENT_ID'))
  url.searchParams.set('redirect_uri', env('GOOGLE_REDIRECT_URI'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  // ADR-003: без offline+consent повторное подключение аккаунта не вернёт refresh-токен
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url.toString()
}

function catchCode(state: string): Promise<string> {
  const redirect = new URL(env('GOOGLE_REDIRECT_URI'))
  const port = Number(redirect.port || 80)

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirect.origin)
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end()
        return
      }
      // Сервер закрываем только после того, как ответ ушёл: иначе keep-alive-сокет
      // браузера остаётся висеть и скрипт не завершается
      const answer = (text: string, done: () => void) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' })
        res.end(`<meta charset="utf-8"><body style="font:16px system-ui;padding:3rem">${text}</body>`, () => {
          server.close()
          server.closeAllConnections()
          done()
        })
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (error) {
        answer('Отказано в доступе. Возвращайся в терминал.', () =>
          reject(new Error(`Google вернул error=${error} — доступ не выдан`)),
        )
      } else if (url.searchParams.get('state') !== state) {
        answer('Не совпал state. Возвращайся в терминал.', () =>
          reject(new Error('не совпал state — запрос пришёл не из нашего браузера')),
        )
      } else if (code) {
        answer('Готово. Можно закрыть вкладку и вернуться в терминал.', () => resolve(code))
      } else {
        res.writeHead(400).end()
      }
    })
    server.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(`порт ${port} занят: освободи его — адрес возврата прописан в Google Cloud и другой не подойдёт`)
          : error,
      )
    })
    server.listen(port, () => console.log(`  жду возврата на ${redirect.origin}${redirect.pathname}`))
  })
}

function openBrowser(url: string): void {
  const child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}

async function exchangeCode(code: string) {
  return tokenRequest({
    code,
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    redirect_uri: env('GOOGLE_REDIRECT_URI'),
    grant_type: 'authorization_code',
  })
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const body = await res.text()
  if (!res.ok) throw new GoogleApiError(res.status, body, 'oauth2/token')
  return JSON.parse(body) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    token_type: string
  }
}

async function freshAccessToken(store: Store, account: Account): Promise<string> {
  if (Date.now() < account.expiresAt - 60_000) return account.accessToken
  const tokens = await tokenRequest({
    refresh_token: account.refreshToken,
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  })
  account.accessToken = tokens.access_token
  account.expiresAt = Date.now() + tokens.expires_in * 1000
  account.lastRefreshAt = new Date().toISOString()
  if (tokens.refresh_token) account.refreshToken = tokens.refresh_token
  saveStore(store)
  return account.accessToken
}

async function gapi<T>(
  store: Store,
  account: Account,
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init
  const url = new URL(path.startsWith('http') ? path : API + path)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value)
  }

  const send = async (token: string) =>
    fetch(url, {
      ...rest,
      headers: {
        ...(rest.headers as Record<string, string> | undefined),
        authorization: `Bearer ${token}`,
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
      },
    })

  let res = await send(await freshAccessToken(store, account))
  if (res.status === 401) {
    account.expiresAt = 0
    res = await send(await freshAccessToken(store, account))
  }
  const body = await res.text()
  if (!res.ok) throw new GoogleApiError(res.status, body, url.pathname + url.search)
  return (body ? JSON.parse(body) : {}) as T
}

async function listCalendars(store: Store, account: Account): Promise<CalendarListEntry[]> {
  const res = await gapi<{ items?: CalendarListEntry[] }>(store, account, '/users/me/calendarList')
  return res.items ?? []
}

async function listEvents(
  store: Store,
  account: Account,
  calendarId: string,
  query: Record<string, string | undefined>,
): Promise<{ items: GoogleEvent[]; nextSyncToken?: string }> {
  const items: GoogleEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  do {
    const page = await gapi<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
      store,
      account,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { query: { ...query, maxResults: '250', pageToken } },
    )
    items.push(...(page.items ?? []))
    pageToken = page.nextPageToken
    nextSyncToken = page.nextSyncToken
  } while (pageToken)
  return { items, nextSyncToken }
}

const moscowTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const moscowSortable = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ,
  dateStyle: 'short',
  timeStyle: 'short',
})

function sortKey(event: GoogleEvent): string {
  const start = event.start ?? {}
  if (start.date) return `${start.date} 00:00`
  if (start.dateTime) return moscowSortable.format(new Date(start.dateTime))
  return ''
}

function showWhen(event: GoogleEvent): string {
  const start = event.start ?? {}
  // Инвариант 3: date у события на весь день печатается как есть, без Date и часового пояса
  if (start.date) return `${start.date} весь день`.padEnd(22)
  if (start.dateTime) return moscowTime.format(new Date(start.dateTime)).padEnd(22)
  return '—'.padEnd(22)
}

function isoDatePlusDays(days: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(Date.now() + days * 86_400_000))
}

function kinds(event: GoogleEvent): string {
  const marks: string[] = []
  if (event.start?.date) marks.push('весь день')
  if (event.recurringEventId) marks.push('повтор')
  if (event.organizer && event.organizer.self !== true) marks.push('чужое')
  if (event.status === 'cancelled') marks.push('отменено')
  return marks.length ? ` [${marks.join(', ')}]` : ''
}

async function cmdAuth(): Promise<void> {
  const store = loadStore()
  const state = randomUUID()
  const url = authUrl(state)
  console.log('\n  Открываю браузер. Если не открылся — ссылка:\n')
  console.log(`  ${url}\n`)
  const codePromise = catchCode(state)
  openBrowser(url)
  const tokens = await exchangeCode(await codePromise)

  if (!tokens.refresh_token) {
    fail('Google не вернул refresh_token. Так бывает без prompt=consent или если аккаунт уже подключён: отзови доступ на myaccount.google.com/permissions и повтори')
  }

  const account: Account = {
    email: '',
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
    connectedAt: new Date().toISOString(),
    lastRefreshAt: null,
    syncTokens: {},
  }

  // Почту берём из primary-календаря: его id и есть адрес аккаунта.
  // Так не приходится просить лишнюю область доступа сверх двух из ADR-003.
  const calendars = await listCalendars(store, account)
  const primary = calendars.find((c) => c.primary)
  if (!primary) fail('у аккаунта нет primary-календаря — некуда взять почту, дальше аккаунты не различить')
  account.email = primary.id

  const existing = store.accounts.findIndex((a) => a.email === account.email)
  if (existing >= 0) store.accounts[existing] = account
  else store.accounts.push(account)
  saveStore(store)

  console.log(`  ✓ подключён ${account.email}, календарей: ${calendars.length}`)
  console.log(`    области доступа: ${account.scope}`)
  console.log(`    всего аккаунтов в ${TOKENS_PATH.split('/').pop()}: ${store.accounts.length}\n`)
}

async function cmdAccounts(): Promise<void> {
  const { accounts } = requireAccounts()
  for (const account of accounts) {
    const age = Math.floor((Date.now() - Date.parse(account.connectedAt)) / 86_400_000)
    console.log(`\n  ${account.email}`)
    console.log(`    подключён:      ${account.connectedAt} (${age} дн. назад)`)
    console.log(`    обновлён:       ${account.lastRefreshAt ?? 'ни разу'}`)
    console.log(`    access истекает:${new Date(account.expiresAt).toISOString()}`)
    console.log(`    sync-токенов:   ${Object.keys(account.syncTokens).length}`)
  }
  console.log()
}

async function cmdCalendars(): Promise<void> {
  const { store, accounts } = requireAccounts()
  for (const account of accounts) {
    console.log(`\n  ${account.email}`)
    for (const calendar of await listCalendars(store, account)) {
      const marks = [calendar.primary ? 'primary' : '', calendar.selected ? 'показан' : 'скрыт']
        .filter(Boolean)
        .join(', ')
      console.log(`    ${(calendar.summary ?? calendar.id).padEnd(34)} ${calendar.accessRole?.padEnd(10)} ${marks}`)
      console.log(`      id: ${calendar.id}`)
    }
  }
  console.log()
}

async function cmdEvents(): Promise<void> {
  const { store, accounts } = requireAccounts()
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const rows: Array<{ sort: string; line: string }> = []
  for (const account of accounts) {
    for (const calendar of await listCalendars(store, account)) {
      const { items } = await listEvents(store, account, calendar.id, {
        singleEvents: 'true',
        orderBy: 'startTime',
        timeMin,
        timeMax,
      })
      for (const event of items) {
        rows.push({
          sort: sortKey(event),
          line: `  ${showWhen(event)} ${(event.summary ?? '(без названия)').slice(0, 40).padEnd(42)} ${calendar.summary ?? calendar.id} · ${account.email}${kinds(event)}`,
        })
      }
    }
  }

  rows.sort((a, b) => a.sort.localeCompare(b.sort))
  console.log(`\n  неделя вперёд, ${accounts.length} аккаунт(а), событий: ${rows.length}\n`)
  for (const row of rows) console.log(row.line)
  console.log()
}

async function cmdSamples(): Promise<void> {
  const { store, accounts } = requireAccounts()
  const wanted: Record<string, (e: GoogleEvent) => boolean> = {
    'на весь день': (e) => Boolean(e.start?.date),
    'экземпляр повторяющегося': (e) => Boolean(e.recurringEventId),
    'чужое приглашение': (e) => Boolean(e.organizer) && e.organizer?.self !== true,
    отменённое: (e) => e.status === 'cancelled',
  }
  const found: Record<string, GoogleEvent | undefined> = {}

  for (const account of accounts) {
    for (const calendar of await listCalendars(store, account)) {
      const { items } = await listEvents(store, account, calendar.id, {
        singleEvents: 'true',
        showDeleted: 'true',
        timeMin: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        timeMax: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      })
      for (const event of items) {
        for (const [name, match] of Object.entries(wanted)) {
          if (!found[name] && match(event)) found[name] = event
        }
      }
    }
  }

  const hints: Record<string, string> = {
    отменённое: '  не нашлось: отдельно удалённые события приходят только инкрементальной синхронизацией — смотри вывод roundtrip после шага 7',
  }
  for (const name of Object.keys(wanted)) {
    console.log(`\n  ── ${name} ──`)
    const event = found[name]
    console.log(
      event
        ? JSON.stringify(event, null, 2)
        : (hints[name] ?? '  не нашлось в окне ±30 дней — заведи такое событие руками и повтори'),
    )
  }
  console.log()
}

async function cmdRoundtrip(calendarArg?: string): Promise<void> {
  const { store, accounts } = requireAccounts()
  const account = accounts[0]!
  const calendars = await listCalendars(store, account)
  const calendar = calendarArg
    ? calendars.find((c) => c.id === calendarArg)
    : calendars.find((c) => c.primary)
  if (!calendar) fail(`календарь ${calendarArg ?? 'primary'} не найден у ${account.email}`)
  const at = `/calendars/${encodeURIComponent(calendar.id)}/events`
  console.log(`\n  ${account.email} → ${calendar.summary ?? calendar.id}\n`)

  const fullSync = await listEvents(store, account, calendar.id, {
    singleEvents: 'true',
    showDeleted: 'true',
    timeMin: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  })
  if (!fullSync.nextSyncToken) fail('полная синхронизация не вернула nextSyncToken')
  account.syncTokens[calendar.id] = fullSync.nextSyncToken
  saveStore(store)
  console.log(`  1. полная синхронизация: событий ${fullSync.items.length}, nextSyncToken получен`)

  const day = isoDatePlusDays(1)
  const created = await gapi<GoogleEvent>(store, account, at, {
    method: 'POST',
    body: JSON.stringify({
      summary: 'WorkFlow: проверка записи',
      description: 'создано скриптом разведки, фаза 01',
      start: { dateTime: `${day}T15:00:00+03:00`, timeZone: TZ },
      end: { dateTime: `${day}T15:30:00+03:00`, timeZone: TZ },
    }),
  })
  console.log(`  2. создано: ${created.id}`)
  console.log(`     etag ${created.etag}`)
  console.log(`     ссылка ${created.htmlLink}`)
  await showIncremental(store, account, calendar.id, '3. после создания')

  const staleEtag = created.etag
  const patched = await gapi<GoogleEvent>(store, account, `${at}/${created.id}`, {
    method: 'PATCH',
    headers: { 'if-match': staleEtag },
    body: JSON.stringify({
      start: { dateTime: `${day}T16:00:00+03:00`, timeZone: TZ },
      end: { dateTime: `${day}T16:30:00+03:00`, timeZone: TZ },
    }),
  })
  console.log(`  4. перенесено на 16:00, новый etag ${patched.etag}`)
  await showIncremental(store, account, calendar.id, '5. после переноса')

  try {
    await gapi<GoogleEvent>(store, account, `${at}/${created.id}`, {
      method: 'PATCH',
      headers: { 'if-match': staleEtag },
      body: JSON.stringify({ summary: 'WorkFlow: правка по устаревшему etag' }),
    })
    console.log('  6. ⚠ PATCH с устаревшим etag ПРОШЁЛ — ожидали 412, проверка версий не работает')
  } catch (error) {
    if (error instanceof GoogleApiError) {
      console.log(`  6. PATCH с устаревшим etag → ${error.status}`)
      console.log(`     ${error.body.replace(/\s+/g, ' ').slice(0, 200)}`)
    } else throw error
  }

  await gapi(store, account, `${at}/${created.id}`, { method: 'DELETE' })
  console.log('  7. удалено')
  await showIncremental(store, account, calendar.id, '8. после удаления')
  console.log()
}

async function showIncremental(store: Store, account: Account, calendarId: string, label: string): Promise<void> {
  const syncToken = account.syncTokens[calendarId]
  if (!syncToken) {
    console.log(`  ${label}: sync-токена нет`)
    return
  }
  try {
    // С syncToken нельзя слать timeMin/timeMax/orderBy — Google ответит 400
    const res = await listEvents(store, account, calendarId, {
      syncToken,
      singleEvents: 'true',
      showDeleted: 'true',
    })
    if (res.nextSyncToken) {
      account.syncTokens[calendarId] = res.nextSyncToken
      saveStore(store)
    }
    console.log(`  ${label}: пришло ${res.items.length}`)
    for (const event of res.items) {
      console.log(`     ${(event.status ?? '').padEnd(9)} ${showWhen(event)} ${event.summary ?? '(без названия)'}`)
    }
  } catch (error) {
    // Два разных отказа, и путать их нельзя. 410 — токен был наш и протух, это штатная
    // ситуация. 400 — Google не признаёт токен своим: в приложении это значит, что мы
    // сохранили мусор, и чинить надо место записи, а не синхронизацию.
    const invalid =
      error instanceof GoogleApiError &&
      (error.status === 410 || (error.status === 400 && error.body.includes('sync token')))
    if (invalid && error instanceof GoogleApiError) {
      delete account.syncTokens[calendarId]
      saveStore(store)
      const reason =
        error.status === 410
          ? 'токен протух, штатная ситуация'
          : 'токен негоден, Google не считает его своим (в приложении — признак нашего бага)'
      console.log(`  ${label}: ${error.status} — ${reason}; обнулён, дальше полная синхронизация`)
      return
    }
    throw error
  }
}

async function cmdSync(mode?: string, args: string[] = []): Promise<void> {
  const { store, accounts } = requireAccounts()
  for (const account of accounts) {
    console.log(`\n  ${account.email}`)
    for (const calendar of await listCalendars(store, account)) {
      const name = calendar.summary ?? calendar.id
      // Какой из двух отказов придёт, зависит от формы строки: ASCII-подделка даёт 410,
      // строка с кириллицей — 400. Так что обе ветки проверяются подстановкой.
      if (mode === 'stale') account.syncTokens[calendar.id] = args.includes('cyrillic') ? 'НЕТОКЕН' : 'nonsense-sync-token'
      if (!account.syncTokens[calendar.id]) {
        const full = await listEvents(store, account, calendar.id, {
          singleEvents: 'true',
          showDeleted: 'true',
          timeMin: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        })
        if (full.nextSyncToken) account.syncTokens[calendar.id] = full.nextSyncToken
        saveStore(store)
        // Горизонт разворачивания повторов: ADR-004 синхронизирует «вперёд без
        // ограничения», и сколько это в днях, из одного числа событий не видно
        const dates = full.items.map(sortKey).filter(Boolean).sort()
        const horizon = dates.length
          ? `, от ${dates[0]!.slice(0, 10)} до ${dates[dates.length - 1]!.slice(0, 10)}`
          : ''
        console.log(`    ${name}: полная синхронизация, событий ${full.items.length}${horizon}`)
        continue
      }
      await showIncremental(store, account, calendar.id, `  ${name}`)
    }
  }
  console.log()
}

async function cmdProbe(): Promise<void> {
  const { store, accounts } = requireAccounts()
  console.log('\n  проверка живости refresh-токенов\n')
  let dead = 0
  for (const account of accounts) {
    const age = ((Date.now() - Date.parse(account.connectedAt)) / 86_400_000).toFixed(1)
    account.expiresAt = 0
    try {
      await freshAccessToken(store, account)
      const calendars = await listCalendars(store, account)
      console.log(`  ✓ ${account.email}: жив на ${age}-й день, календарей ${calendars.length}`)
    } catch (error) {
      dead++
      const detail = error instanceof GoogleApiError ? `${error.status} ${error.body.slice(0, 160)}` : String(error)
      console.log(`  ✗ ${account.email}: мёртв на ${age}-й день — ${detail}`)
    }
  }
  console.log(
    dead === 0
      ? '\n  вывод: приложение действительно в статусе In production (ADR-003)\n'
      : '\n  вывод: токен умер. Проверь статус приложения в Google Cloud — стоп-сигнал из 03-plan.md\n',
  )
}

const USAGE = `
  node scripts/spike-google.ts <команда>

    auth        подключить аккаунт (запускать дважды — для двух разных почт)
    accounts    что лежит в файле токенов и насколько оно свежее
    calendars   список календарей по каждому аккаунту
    events      события двух аккаунтов на неделю вперёд одним списком
    samples     сырой JSON: весь день, повтор, чужое приглашение, отменённое
    roundtrip [calendarId]
                полная синхронизация → создать → перенести → устаревший etag → удалить,
                с инкрементальной синхронизацией после каждого шага
    sync [stale [cyrillic]]
                инкрементальная синхронизация по сохранённым токенам; без токена — полная.
                sync stale подсовывает негодный токен и получает 410, sync stale cyrillic —
                400: ответ зависит от формы строки, а не от того, чей это токен
    probe       восьмой день: жив ли refresh-токен

  SPIKE_DEBUG=1 добавляет стектрейс к сообщению об ошибке.
`

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch {
  console.error('  .env не найден или не читается — беру переменные из окружения')
}

const [command, arg] = process.argv.slice(2)
const commands: Record<string, () => Promise<void>> = {
  auth: cmdAuth,
  accounts: cmdAccounts,
  calendars: cmdCalendars,
  events: cmdEvents,
  samples: cmdSamples,
  roundtrip: () => cmdRoundtrip(arg),
  sync: () => cmdSync(arg, process.argv.slice(4)),
  probe: cmdProbe,
}

const run = command ? commands[command] : undefined
if (!run) {
  console.log(USAGE)
  process.exit(command ? 1 : 0)
}

try {
  await run()
} catch (error) {
  if (process.env.SPIKE_DEBUG) console.error(error)
  fail(error instanceof Error ? error.message : String(error))
}
