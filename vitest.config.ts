import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./vitest.global-setup.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // тесты сервисов делят одну базу и чистят её целиком перед каждым — параллель их перемешает
    fileParallelism: false,
  },
})
