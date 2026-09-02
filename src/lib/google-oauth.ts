export const OAUTH_STATE_COOKIE = 'workflow_google_state'

/** Столько живёт заявка на подключение: экран согласия проходят за минуту, не за час. */
export const OAUTH_STATE_MAX_AGE = 10 * 60

/** Адрес начала подключения. С почтой — переподключение конкретного аккаунта. */
export function connectUrl(email?: string): string {
  const start = '/api/auth/google/start'
  return email ? `${start}?email=${encodeURIComponent(email)}` : start
}
