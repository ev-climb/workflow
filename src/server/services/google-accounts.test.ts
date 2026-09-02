import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.ts'
import { googleAccounts } from '../db/schema.ts'
import type { GoogleCalendarEntry } from '../google/calendars.ts'
import { GoogleAuthError, GoogleGrantRevokedError, type GoogleTokens } from '../google/oauth.ts'
import { decryptToken } from '../google/token-crypto.ts'
import { InvalidInputError, ReauthRequiredError } from './errors.ts'
import {
  accessTokenFor,
  connectGoogleAccount,
  listAccountsNeedingReauth,
  listGoogleAccounts,
} from './google-accounts.ts'
import {
  type GoogleCalendarSummary,
  listGoogleCalendars,
  updateGoogleCalendar,
} from './google-calendars.ts'

vi.mock('../google/oauth.ts', async (importActual) => {
  const actual = await importActual<typeof import('../google/oauth.ts')>()
  return { ...actual, exchangeCode: vi.fn(), refreshAccessToken: vi.fn() }
})
vi.mock('../google/calendars.ts', () => ({ fetchCalendarList: vi.fn() }))

const { exchangeCode, refreshAccessToken } = vi.mocked(await import('../google/oauth.ts'))
const { fetchCalendarList } = vi.mocked(await import('../google/calendars.ts'))

function entry(patch: Partial<GoogleCalendarEntry> = {}): GoogleCalendarEntry {
  return {
    googleCalendarId: 'ru.russian#holiday@group.v.calendar.google.com',
    title: 'Праздники России',
    color: '#16a765',
    selected: true,
    primary: false,
    ...patch,
  }
}

function tokens(patch: Partial<GoogleTokens> = {}): GoogleTokens {
  return {
    accessToken: 'ya29.access',
    refreshToken: '1//0crefresh',
    expiresAt: new Date('2026-09-02T12:00:00Z'),
    ...patch,
  }
}

function googleAnswers(
  email: string,
  patch: Partial<GoogleTokens> = {},
  calendars: GoogleCalendarEntry[] = [],
) {
  exchangeCode.mockResolvedValue(tokens(patch))
  fetchCalendarList.mockResolvedValue([
    entry({ googleCalendarId: email, title: email, color: '#9fe1e7', primary: true }),
    ...calendars,
  ])
}

function byId(calendars: GoogleCalendarSummary[], googleCalendarId: string): GoogleCalendarSummary {
  const found = calendars.find((calendar) => calendar.googleCalendarId === googleCalendarId)
  if (!found) throw new Error(`календаря ${googleCalendarId} нет в списке`)
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('подключение аккаунта Google', () => {
  it('аккаунт заводится с почтой основного календаря', async () => {
    googleAnswers('me@gmail.com')

    const account = await connectGoogleAccount('code')

    expect(account).toMatchObject({ email: 'me@gmail.com', needsReauth: false })
    expect(await listGoogleAccounts()).toEqual([account])
  })

  it('токены лежат в базе зашифрованными — инвариант 6', async () => {
    googleAnswers('me@gmail.com')
    await connectGoogleAccount('code')

    const [row] = await db.select().from(googleAccounts)

    expect(row.refreshTokenEncrypted).not.toContain('1//0crefresh')
    expect(decryptToken(row.refreshTokenEncrypted)).toBe('1//0crefresh')
    expect(decryptToken(row.accessTokenEncrypted ?? '')).toBe('ya29.access')
    expect(row.accessTokenExpiresAt).toEqual(new Date('2026-09-02T12:00:00Z'))
  })

  it('повторное подключение той же почты обновляет запись, а не заводит вторую', async () => {
    googleAnswers('me@gmail.com')
    const first = await connectGoogleAccount('code')

    await db.update(googleAccounts).set({ needsReauth: true })
    googleAnswers('me@gmail.com', { refreshToken: '1//0cдругой' })
    const second = await connectGoogleAccount('code')

    expect(second.id).toBe(first.id)
    expect(second.needsReauth).toBe(false)

    const rows = await db.select().from(googleAccounts)
    expect(rows).toHaveLength(1)
    expect(decryptToken(rows[0].refreshTokenEncrypted)).toBe('1//0cдругой')
  })

  it('второй аккаунт с другой почтой встаёт рядом', async () => {
    googleAnswers('first@gmail.com')
    await connectGoogleAccount('code')
    googleAnswers('second@gmail.com')
    await connectGoogleAccount('code')

    expect((await listGoogleAccounts()).map((a) => a.email)).toEqual([
      'first@gmail.com',
      'second@gmail.com',
    ])
  })

  it('календари аккаунта заводятся сразу за ним', async () => {
    googleAnswers('me@gmail.com', {}, [entry({ selected: false })])

    const account = await connectGoogleAccount('code')
    const calendars = await listGoogleCalendars()

    expect(calendars.map((calendar) => calendar.accountId)).toEqual([account.id, account.id])
    expect(byId(calendars, 'me@gmail.com')).toMatchObject({
      title: 'me@gmail.com',
      color: '#9fe1e7',
      visible: true,
    })
    // снятая в Google отметка — это «не показывать»
    expect(byId(calendars, entry().googleCalendarId)).toMatchObject({
      title: 'Праздники России',
      color: '#16a765',
      visible: false,
    })
  })

  it('повторное подключение правит название, но не выбор цвета и видимости', async () => {
    googleAnswers('me@gmail.com', {}, [entry()])
    await connectGoogleAccount('code')

    const holidays = byId(await listGoogleCalendars(), entry().googleCalendarId)
    await updateGoogleCalendar(holidays.id, { color: '#d50000', visible: false })

    googleAnswers('me@gmail.com', {}, [entry({ title: 'Праздники' })])
    await connectGoogleAccount('code')

    expect(byId(await listGoogleCalendars(), entry().googleCalendarId)).toMatchObject({
      id: holidays.id,
      title: 'Праздники',
      color: '#d50000',
      visible: false,
    })
  })

  it('без основного календаря аккаунт не заводится: почту брать неоткуда', async () => {
    exchangeCode.mockResolvedValue(tokens())
    fetchCalendarList.mockResolvedValue([entry()])

    await expect(connectGoogleAccount('code')).rejects.toThrow(InvalidInputError)
    expect(await listGoogleAccounts()).toEqual([])
  })

  it('отказ Google — ошибка входа, а не пятисотка', async () => {
    exchangeCode.mockRejectedValue(new GoogleAuthError('Google отказал (обмен кода): invalid_grant'))

    await expect(connectGoogleAccount('протухший код')).rejects.toThrow(InvalidInputError)
    expect(await listGoogleAccounts()).toEqual([])
  })

  it('без refresh-токена аккаунт не заводится', async () => {
    googleAnswers('me@gmail.com', { refreshToken: null })

    await expect(connectGoogleAccount('code')).rejects.toThrow(InvalidInputError)
    expect(await listGoogleAccounts()).toEqual([])
  })
})

describe('access-токен аккаунта', () => {
  async function connected(email = 'me@gmail.com', expiresAt = new Date(Date.now() + 3_600_000)) {
    googleAnswers(email)
    const account = await connectGoogleAccount('code')
    await db
      .update(googleAccounts)
      .set({ accessTokenExpiresAt: expiresAt })
      .where(eq(googleAccounts.id, account.id))
    return account
  }

  it('живой токен отдаётся из базы, в Google не ходим', async () => {
    const account = await connected()

    expect(await accessTokenFor(account.id)).toBe('ya29.access')
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('истекающий токен обновляется и ложится в базу зашифрованным', async () => {
    const account = await connected('me@gmail.com', new Date(Date.now() + 30_000))
    const expiresAt = new Date(Date.now() + 3_600_000)
    refreshAccessToken.mockResolvedValue({ accessToken: 'ya29.свежий', expiresAt })

    expect(await accessTokenFor(account.id)).toBe('ya29.свежий')
    expect(refreshAccessToken).toHaveBeenCalledWith('1//0crefresh')

    const [row] = await db.select().from(googleAccounts).where(eq(googleAccounts.id, account.id))
    expect(row.accessTokenEncrypted).not.toContain('ya29.свежий')
    expect(decryptToken(row.accessTokenEncrypted ?? '')).toBe('ya29.свежий')
    expect(row.accessTokenExpiresAt).toEqual(expiresAt)
  })

  it('отозванный доступ помечает аккаунт и стирает прежний токен', async () => {
    const account = await connected('me@gmail.com', new Date(Date.now() - 1000))
    refreshAccessToken.mockRejectedValue(
      new GoogleGrantRevokedError('Google отказал: invalid_grant', 'invalid_grant'),
    )

    await expect(accessTokenFor(account.id)).rejects.toThrow(ReauthRequiredError)

    const [row] = await db.select().from(googleAccounts).where(eq(googleAccounts.id, account.id))
    expect(row.needsReauth).toBe(true)
    expect(row.accessTokenEncrypted).toBeNull()
    expect(row.accessTokenExpiresAt).toBeNull()
  })

  it('отзыв одного аккаунта не мешает остальным', async () => {
    const revoked = await connected('first@gmail.com', new Date(Date.now() - 1000))
    const alive = await connected('second@gmail.com')
    refreshAccessToken.mockRejectedValue(
      new GoogleGrantRevokedError('Google отказал: invalid_grant', 'invalid_grant'),
    )

    await expect(accessTokenFor(revoked.id)).rejects.toThrow(ReauthRequiredError)

    expect(await accessTokenFor(alive.id)).toBe('ya29.access')
  })

  it('временный отказ Google аккаунт не помечает', async () => {
    const account = await connected('me@gmail.com', new Date(Date.now() - 1000))
    refreshAccessToken.mockRejectedValue(new GoogleAuthError('Google отказал: код 503'))

    await expect(accessTokenFor(account.id)).rejects.toThrow(GoogleAuthError)

    const [row] = await db.select().from(googleAccounts).where(eq(googleAccounts.id, account.id))
    expect(row.needsReauth).toBe(false)
  })

  it('помеченный аккаунт токена не отдаёт и в Google не ходит', async () => {
    const account = await connected()
    await db
      .update(googleAccounts)
      .set({ needsReauth: true })
      .where(eq(googleAccounts.id, account.id))

    await expect(accessTokenFor(account.id)).rejects.toThrow(ReauthRequiredError)
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('полосу просит только отвалившийся аккаунт, и переподключение её убирает', async () => {
    const revoked = await connected('first@gmail.com', new Date(Date.now() - 1000))
    await connected('second@gmail.com')
    refreshAccessToken.mockRejectedValue(
      new GoogleGrantRevokedError('Google отказал: invalid_grant', 'invalid_grant'),
    )
    await expect(accessTokenFor(revoked.id)).rejects.toThrow(ReauthRequiredError)

    expect(await listAccountsNeedingReauth()).toMatchObject([{ email: 'first@gmail.com' }])

    googleAnswers('first@gmail.com')
    await connectGoogleAccount('code')

    expect(await listAccountsNeedingReauth()).toEqual([])
  })
})
