import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // тесты не должны зависеть от пояса машины: отрисовка сроков привязана к Москве в коде,
    // и под московским поясом снятая привязка прошла бы незамеченной
    env: { TZ: 'UTC' },
    globalSetup: ['./vitest.global-setup.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // тесты сервисов делят одну базу и чистят её целиком перед каждым — параллель их перемешает
    fileParallelism: false,
  },
})
