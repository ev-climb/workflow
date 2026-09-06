import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.ts'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL не задан: скопируй .env.example в .env и заполни')

// в dev Next.js пересоздаёт модуль на каждую правку, и без кеша пул соединений течёт
const cache = globalThis as { __workflowSql?: ReturnType<typeof postgres> }
const sql = cache.__workflowSql ?? postgres(url)
if (process.env.NODE_ENV !== 'production') cache.__workflowSql = sql

export const db = drizzle(sql, { schema, casing: 'snake_case' })
export type Db = typeof db

/** Соединение внутри `db.transaction`: чтение и запись одного шага идут через него. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
