import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const INFO = 'workflow google tokens v1'
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * Ключ выводится из `APP_ENCRYPTION_KEY` через HKDF с собственным `info`: тот же мастер-ключ
 * подписывает сессию (`src/lib/session.ts`), но разные `info` разводят их по разным ключам.
 */
function key(): Buffer {
  const master = process.env.APP_ENCRYPTION_KEY
  if (!master) {
    throw new Error(
      'APP_ENCRYPTION_KEY не задан: без него токены Google негде хранить, см. .env.example',
    )
  }
  return Buffer.from(hkdfSync('sha256', Buffer.from(master, 'base64'), '', INFO, 32))
}

/** Токен в базу кладётся только так — инвариант 6. Формат: base64 от `iv | tag | шифротекст`. */
export function encryptToken(token: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

/**
 * Расшифровка. Подменённый или зашифрованный другим ключом токен роняет вызов — молча
 * вернуть мусор хуже: он уедет в Google и превратится в непонятную ошибку авторизации.
 */
export function decryptToken(packed: string): string {
  const raw = Buffer.from(packed, 'base64')
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('шифротекст токена короче заголовка')

  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, IV_BYTES))
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8')
}
