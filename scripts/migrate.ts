import { existsSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

// скрипт запускается мимо Next.js и сам .env не читает
if (existsSync('.env')) process.loadEnvFile('.env')

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL не задан: скопируй .env.example в .env и заполни')

// в образе миграции лежат отдельно от исходников, на хосте — на своём месте в дереве
const folder = process.env.MIGRATIONS_DIR?.trim() || 'src/server/db/migrations'

// NOTICE о том, что схема миграций уже есть, приходит на каждый запуск
const sql = postgres(url, { max: 1, onnotice: () => {} })
await migrate(drizzle(sql), { migrationsFolder: folder })
await sql.end()
