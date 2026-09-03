const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/** Больше областей не запрашиваем: события, список календарей и задачи Google Tasks. */
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  // задачи — отдельный продукт со своим API; выданный до этой строки refresh-токен
  // доступа к нему не даёт, аккаунт придётся подключить заново
  'https://www.googleapis.com/auth/tasks',
].join(' ')

/** Отказ на стороне Google: сеть жива, ответ разобран, но подключиться не вышло. */
export class GoogleAuthError extends Error {
  /** Поле `error` из ответа: по нему отличается отзыв доступа от временного сбоя. */
  readonly code: string | null

  constructor(message: string, code: string | null = null) {
    super(message)
    this.code = code
  }
}

/**
 * Доступ отозван или refresh-токен умер: Google отвечает `invalid_grant`. Повторять
 * запрос бессмысленно — нужно новое согласие пользователя.
 */
export class GoogleGrantRevokedError extends GoogleAuthError {}

/** Обновлённый доступ: refresh-грант нового refresh-токена не возвращает. */
export type GoogleAccessToken = {
  accessToken: string
  expiresAt: Date
}

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

export function authUrl(state: string, loginHint?: string | null): string {
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
  // переподключение отвалившегося аккаунта: Google сразу предложит нужную почту, а не
  // список всех, где легко согласиться не тем аккаунтом и завести третий
  if (loginHint) url.searchParams.set('login_hint', loginHint)
  return url.toString()
}

/**
 * Тело ответа в сообщение об ошибке целиком не попадает: на удачном ответе там токены,
 * и одна общая ветка логирования вынесла бы их в лог. Берём только поля отказа.
 */
export function refuse(where: string, status: number, body: string): GoogleAuthError {
  let reason = `код ${status}`
  let code: string | null = null
  try {
    const parsed = JSON.parse(body) as { error?: string; error_description?: string }
    if (parsed.error) {
      code = parsed.error
      // описание бывает бесполезным («Bad Request» на invalid_grant), код — никогда
      reason = parsed.error_description
        ? `${parsed.error}: ${parsed.error_description}`
        : parsed.error
    }
  } catch {
    // не JSON — остаётся код ответа
  }
  return new GoogleAuthError(`Google отказал (${where}): ${reason}`, code)
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
 * Обмен refresh-токена на свежий access-токен. Отзыв доступа приходит сюда же ответом
 * `invalid_grant` и отделён от временных отказов: на первом аккаунт помечают, на втором
 * просто пробуют позже.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleAccessToken> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  })

  const body = await response.text()
  if (!response.ok) {
    const refusal = refuse('обновление access-токена', response.status, body)
    if (refusal.code === 'invalid_grant') {
      throw new GoogleGrantRevokedError(refusal.message, refusal.code)
    }
    throw refusal
  }

  const tokens = JSON.parse(body) as { access_token: string; expires_in: number }

  return {
    accessToken: tokens.access_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  }
}
