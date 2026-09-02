import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { googleAccounts } from '../db/schema.ts'
import { type GoogleCalendarEntry, fetchCalendarList } from '../google/calendars.ts'
import {
  type GoogleAccessToken,
  GoogleAuthError,
  GoogleGrantRevokedError,
  authUrl,
  exchangeCode,
  type GoogleTokens,
  refreshAccessToken,
} from '../google/oauth.ts'
import { decryptToken, encryptToken } from '../google/token-crypto.ts'
import { InvalidInputError, NotFoundError, ReauthRequiredError } from './errors.ts'
import { saveCalendarList } from './google-calendars.ts'

export type GoogleAccountSummary = {
  id: string
  email: string
  needsReauth: boolean
  connectedAt: Date
}

/** Запас перед истечением: токен, которому осталось меньше минуты, обновляем заранее. */
const EXPIRY_MARGIN_MS = 60_000

const SELECT = {
  id: googleAccounts.id,
  email: googleAccounts.email,
  needsReauth: googleAccounts.needsReauth,
  connectedAt: googleAccounts.createdAt,
}

/**
 * Начало потока: адрес согласия и одноразовый `state`, который проверяет обработчик
 * возврата. Почта задаётся при переподключении помеченного аккаунта — чтобы согласие
 * прошло по нему, а не по соседнему.
 */
export function beginGoogleConnect(loginHint?: string | null): { url: string; state: string } {
  const state = randomUUID()
  return { url: authUrl(state, loginHint), state }
}

export function listGoogleAccounts(): Promise<GoogleAccountSummary[]> {
  return db.select(SELECT).from(googleAccounts).orderBy(asc(googleAccounts.createdAt))
}

/** Аккаунты, отвалившиеся по отозванному доступу: по ним интерфейс показывает полосу. */
export function listAccountsNeedingReauth(): Promise<GoogleAccountSummary[]> {
  return db
    .select(SELECT)
    .from(googleAccounts)
    .where(eq(googleAccounts.needsReauth, true))
    .orderBy(asc(googleAccounts.createdAt))
}

/**
 * Возврат из Google: код меняется на токены, дальше одним запросом берётся список
 * календарей — из него же и почта аккаунта, потому что это идентификатор календаря
 * с флагом `primary`; отдельной области доступа к профилю ради почты не просим.
 * Аккаунты различаются по почте, поэтому повторное подключение того же адреса обновляет
 * запись, а не заводит вторую, иначе синхронизация пошла бы по нему дважды.
 */
export async function connectGoogleAccount(code: string): Promise<GoogleAccountSummary> {
  const { tokens, calendars } = await identify(code)
  const email = calendars.find((calendar) => calendar.primary)?.googleCalendarId
  if (!email) {
    throw new InvalidInputError('у аккаунта нет основного календаря — почту брать неоткуда')
  }

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

  await saveCalendarList(account.id, calendars)

  return account
}

/** Отказ Google — ошибка входа: код возврата бывает чужим, просроченным и уже использованным. */
async function identify(
  code: string,
): Promise<{ tokens: GoogleTokens; calendars: GoogleCalendarEntry[] }> {
  try {
    const tokens = await exchangeCode(code)
    return { tokens, calendars: await fetchCalendarList(tokens.accessToken) }
  } catch (error) {
    if (error instanceof GoogleAuthError) throw new InvalidInputError(error.message)
    throw error
  }
}

/**
 * Годный прямо сейчас access-токен аккаунта: живой отдаётся из базы, истекающий
 * обменивается на свежий по refresh-токену. Помеченный аккаунт токена не отдаёт и в
 * Google не ходит — доступа у нас нет до нового согласия пользователя.
 */
export async function accessTokenFor(accountId: string): Promise<string> {
  const [account] = await db
    .select({
      email: googleAccounts.email,
      needsReauth: googleAccounts.needsReauth,
      refreshTokenEncrypted: googleAccounts.refreshTokenEncrypted,
      accessTokenEncrypted: googleAccounts.accessTokenEncrypted,
      accessTokenExpiresAt: googleAccounts.accessTokenExpiresAt,
    })
    .from(googleAccounts)
    .where(eq(googleAccounts.id, accountId))

  if (!account) throw new NotFoundError('аккаунта Google нет')
  if (account.needsReauth) throw reauthRequired(account.email)

  const { accessTokenEncrypted, accessTokenExpiresAt } = account
  if (
    accessTokenEncrypted &&
    accessTokenExpiresAt &&
    accessTokenExpiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS
  ) {
    return decryptToken(accessTokenEncrypted)
  }

  let fresh: GoogleAccessToken
  try {
    fresh = await refreshAccessToken(decryptToken(account.refreshTokenEncrypted))
  } catch (error) {
    // помечает только отзыв доступа: на временном отказе Google аккаунт остаётся рабочим,
    // иначе получасовой сбой потребовал бы ручного переподключения
    if (error instanceof GoogleGrantRevokedError) {
      await markNeedsReauth(accountId)
      throw reauthRequired(account.email, error)
    }
    throw error
  }

  await db
    .update(googleAccounts)
    .set({
      accessTokenEncrypted: encryptToken(fresh.accessToken),
      accessTokenExpiresAt: fresh.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(googleAccounts.id, accountId))

  return fresh.accessToken
}

/** Прежний access-токен вместе с пометкой стирается: пользоваться им больше нельзя. */
function markNeedsReauth(accountId: string): Promise<unknown> {
  return db
    .update(googleAccounts)
    .set({
      needsReauth: true,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(googleAccounts.id, accountId))
}

function reauthRequired(email: string, cause?: unknown): ReauthRequiredError {
  return new ReauthRequiredError(`аккаунт ${email} требует повторной авторизации`, { cause })
}
