import { randomUUID } from 'node:crypto'
import { asc } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { googleAccounts } from '../db/schema.ts'
import {
  GoogleAuthError,
  authUrl,
  exchangeCode,
  primaryEmail,
  type GoogleTokens,
} from '../google/oauth.ts'
import { encryptToken } from '../google/token-crypto.ts'
import { InvalidInputError } from './errors.ts'

export type GoogleAccountSummary = {
  id: string
  email: string
  needsReauth: boolean
  connectedAt: Date
}

const SELECT = {
  id: googleAccounts.id,
  email: googleAccounts.email,
  needsReauth: googleAccounts.needsReauth,
  connectedAt: googleAccounts.createdAt,
}

/** Начало потока: адрес согласия и одноразовый `state`, который проверяет обработчик возврата. */
export function beginGoogleConnect(): { url: string; state: string } {
  const state = randomUUID()
  return { url: authUrl(state), state }
}

export function listGoogleAccounts(): Promise<GoogleAccountSummary[]> {
  return db.select(SELECT).from(googleAccounts).orderBy(asc(googleAccounts.createdAt))
}

/**
 * Возврат из Google: код меняется на токены, почта берётся из основного календаря.
 * Аккаунты различаются по почте — повторное подключение того же адреса обновляет
 * запись, а не заводит вторую, иначе синхронизация пошла бы по нему дважды.
 */
export async function connectGoogleAccount(code: string): Promise<GoogleAccountSummary> {
  const { tokens, email } = await identify(code)

  // при `prompt=consent` refresh-токен приходит всегда; если его нет, записывать нечего:
  // без него доступ умрёт через час и подключение окажется бесполезным
  if (!tokens.refreshToken) {
    throw new InvalidInputError(
      'Google не вернул refresh-токен: отзови доступ приложению в аккаунте и подключи заново',
    )
  }

  const secrets = {
    refreshTokenEncrypted: encryptToken(tokens.refreshToken),
    accessTokenEncrypted: encryptToken(tokens.accessToken),
    accessTokenExpiresAt: tokens.expiresAt,
  }

  const [account] = await db
    .insert(googleAccounts)
    .values({ email, ...secrets })
    .onConflictDoUpdate({
      target: googleAccounts.email,
      set: { ...secrets, needsReauth: false, updatedAt: new Date() },
    })
    .returning(SELECT)

  return account
}

/** Отказ Google — ошибка входа: код возврата бывает чужим, просроченным и уже использованным. */
async function identify(code: string): Promise<{ tokens: GoogleTokens; email: string }> {
  try {
    const tokens = await exchangeCode(code)
    return { tokens, email: await primaryEmail(tokens.accessToken) }
  } catch (error) {
    if (error instanceof GoogleAuthError) throw new InvalidInputError(error.message)
    throw error
  }
}
