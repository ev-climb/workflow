import { beforeEach } from 'vitest'
import { truncateAll } from './vitest.db.ts'
import { testDatabaseUrl } from './vitest.env.ts'

// до импорта тестового файла: клиент базы читает DATABASE_URL на старте модуля,
// и подменить адрес позже уже нельзя
process.env.DATABASE_URL = testDatabaseUrl()

beforeEach(truncateAll)
