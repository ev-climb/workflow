import { beforeEach } from 'vitest'
import { testDatabaseUrl } from './vitest.env.ts'

// до импорта тестового файла: клиент базы читает DATABASE_URL на старте модуля,
// и подменить адрес позже уже нельзя
process.env.DATABASE_URL = testDatabaseUrl()

const { db } = await import('./src/server/db/client.ts')
const { sql } = await import('drizzle-orm')

beforeEach(async () => {
  // каскад доберёт списки, карточки, метки, чек-листы и связи; заметки живут сами по
  // себе и ни с одной доской не связаны — их приходится называть явно
  await db.execute(
    sql`truncate boards, google_accounts, workspace_state, notes, note_folders
        restart identity cascade`,
  )
})
