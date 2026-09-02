import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.ts'
import { googleAccounts } from '../db/schema.ts'
import { GoogleAuthError, type GoogleTokens } from '../google/oauth.ts'
import { decryptToken } from '../google/token-crypto.ts'
import { InvalidInputError } from './errors.ts'
import { connectGoogleAccount, listGoogleAccounts } from './google-accounts.ts'

vi.mock('../google/oauth.ts', async (importActual) => {
  const actual = await importActual<typeof import('../google/oauth.ts')>()
  return { ...actual, exchangeCode: vi.fn(), primaryEmail: vi.fn() }
})

const { exchangeCode, primaryEmail } = vi.mocked(await import('../google/oauth.ts'))

function tokens(patch: Partial<GoogleTokens> = {}): GoogleTokens {
  return {
    accessToken: 'ya29.access',
    refreshToken: '1//0crefresh',
    expiresAt: new Date('2026-09-02T12:00:00Z'),
    ...patch,
  }
}

function googleAnswers(email: string, patch: Partial<GoogleTokens> = {}) {
  exchangeCode.mockResolvedValue(tokens(patch))
  primaryEmail.mockResolvedValue(email)
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
