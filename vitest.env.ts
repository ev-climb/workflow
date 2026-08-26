import { existsSync } from 'node:fs'

/**
 * Адрес тестовой базы. По умолчанию — та же машина и та же строка подключения, но база
 * с суффиксом `_test`: тесты чистят таблицы целиком, и промах по адресу стоил бы рабочих
 * данных. Совпадение с `DATABASE_URL` считается ошибкой, а не «и так сойдёт».
 */
export function testDatabaseUrl(): string {
  if (existsSync('.env')) process.loadEnvFile('.env')

  const source = process.env.DATABASE_URL
  if (!source) {
    throw new Error('DATABASE_URL не задан: тестам нужна поднятая база, docker compose up -d db')
  }

  const explicit = process.env.TEST_DATABASE_URL
  const url = new URL(explicit ?? source)
  if (!explicit) url.pathname = `${url.pathname.replace(/\/$/, '')}_test`

  if (url.href === new URL(source).href) {
    throw new Error(
      'TEST_DATABASE_URL совпадает с DATABASE_URL: тесты вычищают таблицы, ' +
        'рабочая база не годится',
    )
  }

  return url.href
}

/** Служебная база того же кластера — в ней создаётся тестовая. */
export function maintenanceUrl(testUrl: string): { url: string; database: string } {
  const url = new URL(testUrl)
  const database = decodeURIComponent(url.pathname.slice(1))
  url.pathname = '/postgres'
  return { url: url.href, database }
}
