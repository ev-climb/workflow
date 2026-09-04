import { timingSafeEqual } from 'node:crypto'
import { verifyPassword } from '../../lib/password.ts'
import { issueSession, isSessionValid } from '../../lib/session.ts'
import { UnauthorizedError } from './errors.ts'

/**
 * Пользователь ровно один, регистрации нет: пароль сверяется с `APP_PASSWORD_HASH`.
 * Хеш для переменной берётся из `pnpm auth:hash`.
 */
export async function signIn(password: string): Promise<{ token: string; expiresAt: Date }> {
  const stored = process.env.APP_PASSWORD_HASH
  if (!stored) {
    throw new Error('APP_PASSWORD_HASH не задан: заполни .env, хеш даёт pnpm auth:hash')
  }

  if (!(await verifyPassword(password, stored))) {
    throw new UnauthorizedError('пароль не подошёл')
  }

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
