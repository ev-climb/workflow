import { randomBytes } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from './token-crypto.ts'

const real = process.env.APP_ENCRYPTION_KEY

// ключ подменяется на свой: тесту не нужен настоящий, а соседние файлы читают тот же
// process.env — оставить чужое значение подменённым нельзя
beforeEach(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

afterAll(() => {
  process.env.APP_ENCRYPTION_KEY = real
})

describe('шифрование токенов Google', () => {
  it('расшифровка возвращает исходный токен', () => {
    const token = '1//0cREFRESHtoken-с-кириллицей'
    expect(decryptToken(encryptToken(token))).toBe(token)
  })

  it('в шифротексте нет исходного токена и он каждый раз разный', () => {
    const token = 'ya29.a0AfH6SMB'
    const first = encryptToken(token)

    expect(first).not.toContain(token)
    expect(Buffer.from(first, 'base64').toString('utf8')).not.toContain(token)
    expect(encryptToken(token)).not.toBe(first)
  })

  it('подменённый шифротекст не расшифровывается, а роняет вызов', () => {
    const packed = Buffer.from(encryptToken('ya29.token'), 'base64')
    packed[packed.length - 1] ^= 0xff

    expect(() => decryptToken(packed.toString('base64'))).toThrow()
  })

  it('чужой ключ не подходит', () => {
    const packed = encryptToken('ya29.token')
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64')

    expect(() => decryptToken(packed)).toThrow()
  })
})
