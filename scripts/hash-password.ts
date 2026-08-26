// Считает значение для APP_PASSWORD_HASH. Пароль читается из stdin, чтобы не осесть
// в истории оболочки:  pnpm auth:hash
import { createInterface } from 'node:readline/promises'
import { hashPassword } from '../src/lib/password.ts'

const rl = createInterface({ input: process.stdin, output: process.stderr })
const password = await rl.question('пароль: ')
rl.close()

if (password.length < 8) {
  console.error('пароль короче восьми символов — не годится')
  process.exit(1)
}

console.error('\nстрока для .env:\n')
console.log(`APP_PASSWORD_HASH=${await hashPassword(password)}`)
