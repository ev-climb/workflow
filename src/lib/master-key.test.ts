import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { checkMasterKey, derivedKey } from './master-key.ts'

const real = process.env.APP_ENCRYPTION_KEY

// ключ подменяется на свой: соседние файлы читают тот же process.env, оставить чужое
// значение подменённым нельзя
afterEach(() => {
  if (real === undefined) delete process.env.APP_ENCRYPTION_KEY
  else process.env.APP_ENCRYPTION_KEY = real
})

describe('мастер-ключ', () => {
  it('пропускает 32 байта в base64', () => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64')

    expect(() => checkMasterKey()).not.toThrow()
    expect(derivedKey('info')).toHaveLength(32)
  })

  it('роняет старт на незаданном ключе', () => {
    delete process.env.APP_ENCRYPTION_KEY

    expect(() => checkMasterKey()).toThrow(/APP_ENCRYPTION_KEY не задан/)
  })

  it('роняет старт на парольной фразе вместо ключа', () => {
    process.env.APP_ENCRYPTION_KEY = 'очень секретный пароль'

    expect(() => checkMasterKey()).toThrow(/вместо 32/)
  })

  it('роняет старт на ключе короче 32 байт', () => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(16).toString('base64')

    expect(() => derivedKey('info')).toThrow(/16 байт вместо 32/)
  })

  it('разводит потребителей по разным ключам', () => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64')

    expect(derivedKey('первый')).not.toEqual(derivedKey('второй'))
  })
})
