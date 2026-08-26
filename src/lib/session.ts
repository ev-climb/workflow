import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'workflow_session'
const TTL_SECONDS = 30 * 24 * 60 * 60
const INFO = 'workflow session v1'

/**
 * Ключ подписи выводится из `APP_ENCRYPTION_KEY` через HKDF: отдельной переменной
 * окружения не заводим, а разные `info` разводят подпись сессии и шифрование токенов
 * Google по разным ключам.
 */
function signingKey(): Buffer {
  const master = process.env.APP_ENCRYPTION_KEY
  if (!master) {
    throw new Error('APP_ENCRYPTION_KEY не задан: без него вход не работает, см. .env.example')
  }
  return Buffer.from(hkdfSync('sha256', Buffer.from(master, 'base64'), '', INFO, 32))
}

const b64url = (value: Buffer | string) =>
  Buffer.from(value).toString('base64url')

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url')
}

export function issueSession(now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now + TTL_SECONDS * 1000)
  const payload = b64url(String(expiresAt.getTime()))
  return { token: `${payload}.${sign(payload)}`, expiresAt }
}

/** Проверяет подпись и срок. Любая кривизна токена — `false`, а не исключение. */
export function isSessionValid(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false

  const dot = token.indexOf('.')
  if (dot < 1) return false

  const payload = token.slice(0, dot)
  const signature = Buffer.from(token.slice(dot + 1), 'base64url')
  const expected = Buffer.from(sign(payload), 'base64url')
  if (signature.length !== expected.length) return false
  if (!timingSafeEqual(signature, expected)) return false

  const expiresAt = Number(Buffer.from(payload, 'base64url').toString())
  return Number.isFinite(expiresAt) && expiresAt > now
}

export const SESSION_MAX_AGE = TTL_SECONDS
