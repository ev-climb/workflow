import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../../lib/password.ts'
import { hasValidMcpToken, mcpBearerToken, resetLoginThrottle, signIn } from './auth.ts'
import { UnauthorizedError } from './errors.ts'

const before = process.env.MCP_BEARER_TOKEN

afterEach(() => {
  if (before === undefined) delete process.env.MCP_BEARER_TOKEN
  else process.env.MCP_BEARER_TOKEN = before
})

describe('токен MCP по HTTP', () => {
  it('незаданная и пустая переменная — одно и то же: токена нет', () => {
    delete process.env.MCP_BEARER_TOKEN
    expect(mcpBearerToken()).toBeNull()

    process.env.MCP_BEARER_TOKEN = ''
    expect(mcpBearerToken()).toBeNull()
  })

  it('без токена в окружении не проходит и верный заголовок', () => {
    delete process.env.MCP_BEARER_TOKEN
    expect(hasValidMcpToken('Bearer что-угодно')).toBe(false)
  })

  it('пропускает только точное совпадение', () => {
    process.env.MCP_BEARER_TOKEN = 's3cret'

    expect(hasValidMcpToken('Bearer s3cret')).toBe(true)
    expect(hasValidMcpToken('Bearer s3cre')).toBe(false)
    expect(hasValidMcpToken('Bearer s3cret ')).toBe(false)
    expect(hasValidMcpToken('Bearer S3CRET')).toBe(false)
  })

  it('чужая схема и отсутствующий заголовок — отказ', () => {
    process.env.MCP_BEARER_TOKEN = 's3cret'

    expect(hasValidMcpToken('s3cret')).toBe(false)
    expect(hasValidMcpToken('Basic s3cret')).toBe(false)
    expect(hasValidMcpToken(null)).toBe(false)
    expect(hasValidMcpToken(undefined)).toBe(false)
  })
})

describe('ограничение попыток входа', () => {
  const password = 'верный-пароль'
  const env = {
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    APP_PASSWORD_HASH: process.env.APP_PASSWORD_HASH,
  }

  const fail = () => expect(signIn('мимо')).rejects.toThrow(UnauthorizedError)

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
    process.env.APP_PASSWORD_HASH = await hashPassword(password)
  })

  afterAll(() => {
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  beforeEach(() => {
    resetLoginThrottle()
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('после пяти неудач подряд отказывает и верному паролю', async () => {
    for (let i = 0; i < 5; i += 1) await fail()

    await expect(signIn(password)).rejects.toThrow(UnauthorizedError)
  })

  it('до пятой неудачи верный пароль проходит', async () => {
    for (let i = 0; i < 4; i += 1) await fail()

    await expect(signIn(password)).resolves.toHaveProperty('token')
  })

  it('минута прошла — запрет снят', async () => {
    for (let i = 0; i < 5; i += 1) await fail()

    vi.advanceTimersByTime(59_000)
    await expect(signIn(password)).rejects.toThrow(UnauthorizedError)

    vi.advanceTimersByTime(2_000)
    await expect(signIn(password)).resolves.toHaveProperty('token')
  })

  it('удачный вход обнуляет счётчик', async () => {
    for (let i = 0; i < 4; i += 1) await fail()
    await signIn(password)

    for (let i = 0; i < 4; i += 1) await fail()
    await expect(signIn(password)).resolves.toHaveProperty('token')
  })
})
