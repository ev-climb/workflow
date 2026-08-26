import { beforeEach } from 'vitest'
import { testDatabaseUrl } from './vitest.env.ts'

// до импорта тестового файла: клиент базы читает DATABASE_URL на старте модуля,
// и подменить адрес позже уже нельзя
process.env.DATABASE_URL = testDatabaseUrl()

const { db } = await import('./src/server/db/client.ts')
const { sql } = await import('drizzle-orm')

beforeEach(async () => {
  // каскад доберёт списки, карточки, метки, чек-листы и связи
  await db.execute(
    sql`truncate boards, google_accounts, workspace_state restart identity cascade`,
  )
})
