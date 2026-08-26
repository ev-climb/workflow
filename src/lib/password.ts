import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// Разделитель — точка, а не `$`: Next раскрывает `$имя` в значении .env как подстановку
// переменной, и хеш с долларами приезжает в приложение обрезанным. base64url выбран по той
// же причине — в нём нет ни `$`, ни символов, требующих кавычек.
const SEPARATOR = '.'
const SCHEME = 'scrypt'
const COST = 16384
const BLOCK_SIZE = 8
const PARALLEL = 1
const KEY_BYTES = 32
const SALT_BYTES = 16

type Params = { cost: number; blockSize: number; parallel: number }

function derive(password: string, salt: Buffer, params: Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const options = {
      N: params.cost,
      r: params.blockSize,
      p: params.parallel,
      // объём памяти scrypt при N=16384, r=8 — 16 МиБ, вдвое больше значения по умолчанию
      maxmem: 128 * params.cost * params.blockSize * 2,
    }
    scrypt(password.normalize('NFKC'), salt, KEY_BYTES, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

/** Хеш для `APP_PASSWORD_HASH`: `scrypt.N.r.p.соль.ключ`, соль и ключ в base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const params = { cost: COST, blockSize: BLOCK_SIZE, parallel: PARALLEL }
  const key = await derive(password, salt, params)
  return [
    SCHEME,
    COST,
    BLOCK_SIZE,
    PARALLEL,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join(SEPARATOR)
}

/** Сравнение за постоянное время. Кривой хеш — `false`, а не исключение. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(SEPARATOR)
  if (parts.length !== 6 || parts[0] !== SCHEME) return false

  const [, cost, blockSize, parallel, salt, key] = parts
  const params = { cost: Number(cost), blockSize: Number(blockSize), parallel: Number(parallel) }
  if (!Object.values(params).every((n) => Number.isInteger(n) && n > 0)) return false

  const expected = Buffer.from(key, 'base64url')
  if (expected.length !== KEY_BYTES) return false

  const actual = await derive(password, Buffer.from(salt, 'base64url'), params)
  return timingSafeEqual(actual, expected)
}
