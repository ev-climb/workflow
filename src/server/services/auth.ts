import { timingSafeEqual } from 'node:crypto'
import { verifyPassword } from '../../lib/password.ts'
import { issueSession, isSessionValid } from '../../lib/session.ts'
import { UnauthorizedError } from './errors.ts'

/**
 * Вход — единственный публичный эндпоинт, а сверка пароля это scrypt на 16 МиБ. Без
 * счётчика он же и неограниченный перебор пароля, и дешёвый способ занять процесс потоком
 * запросов с любым телом. Пользователь один, поэтому счётчик общий, а не по адресу.
 */
const MAX_FAILURES = 5
const LOCK_MS = 60_000

let failures = 0
let lockedUntil = 0

/** Снимает запрет и обнуляет счётчик. Нужно тестам: состояние живёт в памяти модуля. */
export function resetLoginThrottle(): void {
  failures = 0
  lockedUntil = 0
}

/**
 * Пользователь ровно один, регистрации нет: пароль сверяется с `APP_PASSWORD_HASH`.
 * Хеш для переменной берётся из `pnpm auth:hash`.
 */
export async function signIn(password: string): Promise<{ token: string; expiresAt: Date }> {
  const stored = process.env.APP_PASSWORD_HASH
  if (!stored) {
    throw new Error('APP_PASSWORD_HASH не задан: заполни .env, хеш даёт pnpm auth:hash')
  }

  // отказ до scrypt, иначе запрет не спасает от нагрузки
  if (Date.now() < lockedUntil) {
    throw new UnauthorizedError('слишком много попыток входа')
  }

  if (!(await verifyPassword(password, stored))) {
    failures += 1
    if (failures >= MAX_FAILURES) {
      failures = 0
      lockedUntil = Date.now() + LOCK_MS
    }
    throw new UnauthorizedError('пароль не подошёл')
  }

  resetLoginThrottle()
  return issueSession()
}

export function hasValidSession(token: string | undefined): boolean {
  return isSessionValid(token)
}

/**
 * Токен для MCP по HTTP. Незаданная переменная — не «пускать всех», а «эндпоинта нет»:
 * решение принимает маршрут, здесь только источник истины.
 */
export function mcpBearerToken(): string | null {
  return process.env.MCP_BEARER_TOKEN || null
}

/** Сверка постоянным временем: токен один и живёт вечно, подбор по времени ответа дёшев. */
export function hasValidMcpToken(header: string | null | undefined): boolean {
  const expected = mcpBearerToken()
  if (expected === null || !header?.startsWith('Bearer ')) return false

  const given = Buffer.from(header.slice('Bearer '.length))
  const want = Buffer.from(expected)
  return given.length === want.length && timingSafeEqual(given, want)
}
