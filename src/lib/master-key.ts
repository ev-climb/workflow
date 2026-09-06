import { hkdfSync } from 'node:crypto'

const KEY_BYTES = 32

/**
 * Мастер-ключ из окружения. Длина проверяется здесь: `Buffer.from` разберёт как base64 и
 * парольную фразу, и строку с опечаткой — молча, коротким буфером, а `hkdfSync` примет
 * любой. Токены зашифровались бы ключом неизвестной стойкости без единого признака, что
 * что-то не так, — инвариант 6 держится на этой переменной.
 */
function masterKey(): Buffer {
  const value = process.env.APP_ENCRYPTION_KEY
  if (!value) {
    throw new Error(
      'APP_ENCRYPTION_KEY не задан: без него нет ни входа, ни хранения токенов Google, см. .env.example',
    )
  }

  const key = Buffer.from(value, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `APP_ENCRYPTION_KEY декодировался в ${key.length} байт вместо ${KEY_BYTES}: нужны 32 случайных байта в base64, openssl rand -base64 32`,
    )
  }

  return key
}

/**
 * Проверка при старте. Кривой ключ иначе всплывает падением расшифровки в фоновой
 * синхронизации через месяцы, когда концов уже не найти.
 */
export function checkMasterKey(): void {
  masterKey()
}

/**
 * Ключ под конкретного потребителя. Мастер-ключ один, но разные `info` разводят подпись
 * сессии и шифрование токенов Google по разным ключам.
 */
export function derivedKey(info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey(), '', info, KEY_BYTES))
}
