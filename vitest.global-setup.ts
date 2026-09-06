import { prepareDatabase } from './vitest.db.ts'

/** Один раз на прогон: завести тестовую базу, если её нет, и накатить миграции. */
export default prepareDatabase
