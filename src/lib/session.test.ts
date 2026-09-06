import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { issueSession, isSessionValid } from './session.ts'

const before = { key: process.env.APP_ENCRYPTION_KEY, hash: process.env.APP_PASSWORD_HASH }

const restore = (name: 'APP_ENCRYPTION_KEY' | 'APP_PASSWORD_HASH', value: string | undefined) => {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

beforeEach(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  process.env.APP_PASSWORD_HASH = 'scrypt$первый'
})

afterEach(() => {
  restore('APP_ENCRYPTION_KEY', before.key)
  restore('APP_PASSWORD_HASH', before.hash)
})

describe('кука сессии', () => {
  it('свой токен проходит, испорченный — нет', () => {
    const { token } = issueSession()

    expect(isSessionValid(token)).toBe(true)
    expect(isSessionValid(`${token}x`)).toBe(false)
    expect(isSessionValid(undefined)).toBe(false)
    expect(isSessionValid('без точки')).toBe(false)
  })

  it('просроченный токен не проходит', () => {
    const now = Date.UTC(2026, 0, 1)
    const { token, expiresAt } = issueSession(now)

    expect(isSessionValid(token, expiresAt.getTime() - 1)).toBe(true)
    expect(isSessionValid(token, expiresAt.getTime() + 1)).toBe(false)
  })

  it('смена пароля обнуляет уже выданные куки', () => {
    const { token } = issueSession()

    process.env.APP_PASSWORD_HASH = 'scrypt$второй'
    expect(isSessionValid(token)).toBe(false)
  })

  it('шифрование токенов Google от смены пароля не зависит', async () => {
    const { encryptToken, decryptToken } = await import('../server/google/token-crypto.ts')
    const packed = encryptToken('refresh-токен')

    process.env.APP_PASSWORD_HASH = 'scrypt$второй'
    expect(decryptToken(packed)).toBe('refresh-токен')
  })

  it('без APP_PASSWORD_HASH подписывать нечем', () => {
    delete process.env.APP_PASSWORD_HASH
    expect(() => issueSession()).toThrow('APP_PASSWORD_HASH')
  })
})
