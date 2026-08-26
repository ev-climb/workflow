import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit запускается мимо Next.js и сам .env не читает
if (existsSync('.env')) process.loadEnvFile('.env')

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL не задан: скопируй .env.example в .env и заполни')

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
})
