const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CALENDAR_LIST = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'

/** Больше областей не запрашиваем: чтение и запись событий плюс список календарей. */
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ')

/** Отказ на стороне Google: сеть жива, ответ разобран, но подключиться не вышло. */
export class GoogleAuthError extends Error {}

export type GoogleTokens = {
  accessToken: string
  /** Приходит только при `prompt=consent`; без него подключение бессмысленно. */
  refreshToken: string | null
  expiresAt: Date
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`не задана переменная ${name} — заполни .env, см. .env.example`)
  return value
}

export function authUrl(state: string): string {
  const url = new URL(AUTH_ENDPOINT)
  url.searchParams.set('client_id', env('GOOGLE_CLIENT_ID'))
  url.searchParams.set('redirect_uri', env('GOOGLE_REDIRECT_URI'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  // ADR-003: без offline+consent повторное подключение того же аккаунта не вернёт
  // refresh-токен, и это выглядит как случайная поломка
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url.toString()
}

/**
 * Тело ответа в сообщение об ошибке целиком не попадает: на удачном ответе там токены,
 * и одна общая ветка логирования вынесла бы их в лог. Берём только поля отказа.
 */
function refuse(where: string, status: number, body: string): GoogleAuthError {
  let reason = `код ${status}`
  try {
    const parsed = JSON.parse(body) as { error?: string; error_description?: string }
    if (parsed.error) reason = parsed.error_description ?? parsed.error
  } catch {
    // не JSON — остаётся код ответа
  }
  return new GoogleAuthError(`Google отказал (${where}): ${reason}`)
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: env('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  })

  const body = await response.text()
  if (!response.ok) throw refuse('обмен кода на токены', response.status, body)

  const tokens = JSON.parse(body) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  }
}

/**
 * Адрес почты аккаунта — это идентификатор календаря с флагом `primary`. Отдельной области
 * доступа к профилю ради почты не просим: см. `.docs/02-technical.md`, раздел «OAuth».
 */
export async function primaryEmail(accessToken: string): Promise<string> {
  const response = await fetch(`${CALENDAR_LIST}?minAccessRole=owner`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })

  const body = await response.text()
  if (!response.ok) throw refuse('список календарей', response.status, body)

  const list = JSON.parse(body) as { items?: { id: string; primary?: boolean }[] }
  const primary = list.items?.find((item) => item.primary)
  if (!primary) throw new GoogleAuthError('у аккаунта нет основного календаря — почту брать неоткуда')

  return primary.id
}
