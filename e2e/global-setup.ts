import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { maintenanceUrl, testDatabaseUrl } from '../vitest.env.ts'

/**
 * Та же тестовая база, что у vitest, с той же защитой от промаха по рабочей. Данные
 * засеваются перед каждым сценарием, здесь только база и миграции.
 */
export default async function globalSetup() {
  const url = testDatabaseUrl()
  const { url: adminUrl, database } = maintenanceUrl(url)

  const admin = postgres(adminUrl, { max: 1 })
  try {
    const [existing] = await admin`select 1 from pg_database where datname = ${database}`
    if (!existing) await admin.unsafe(`create database "${database}"`)
  } finally {
    await admin.end()
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(sql), { migrationsFolder: './src/server/db/migrations' })
  } finally {
    await sql.end()
  }
}
