import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { maintenanceUrl, testDatabaseUrl } from './vitest.env.ts'

/**
 * Один раз на прогон: завести тестовую базу, если её нет, и накатить миграции. Общая для
 * vitest и playwright — от двух копий база у них разъехалась бы под одним адресом.
 */
export async function prepareDatabase(): Promise<void> {
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

/**
 * Чистая база перед тестом и перед сценарием. Каскад доберёт списки, карточки, метки,
 * чек-листы и связи; заметки живут сами по себе и ни с одной доской не связаны — их
 * приходится называть явно.
 *
 * Клиент базы читает `DATABASE_URL` на старте модуля, поэтому импортируется он здесь, а не
 * сверху: адрес тестовой базы подставляет вызывающий.
 */
export async function truncateAll(): Promise<void> {
  const { sql } = await import('drizzle-orm')
  const { db } = await import('./src/server/db/client.ts')

  await db.execute(
    sql`truncate boards, google_accounts, workspace_state, notes, note_folders, daily_results
        restart identity cascade`,
  )
}
