import { afterEach, describe, expect, it } from 'vitest'
import { hasValidMcpToken, mcpBearerToken } from './auth.ts'

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
