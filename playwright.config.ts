import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'
import { E2E_ORIGIN, E2E_PORT, PASSWORD } from './e2e/fixture.ts'
import { hashPassword } from './src/lib/password.ts'
import { testDatabaseUrl } from './vitest.env.ts'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // первый заход поднимает страницу с холодной сборкой
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // сценарии делят одну базу и одно состояние стола: параллель их перемешает
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: E2E_ORIGIN,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: `pnpm exec next dev --port ${E2E_PORT}`,
    // страница входа не ходит в базу: сервер готов раньше, чем засев доигран
    url: `${E2E_ORIGIN}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      // окружение прогона перекрывает .env: Next не переопределяет уже заданные переменные
      DATABASE_URL: testDatabaseUrl(),
      APP_PASSWORD_HASH: await hashPassword(PASSWORD),
      APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    },
  },
})
