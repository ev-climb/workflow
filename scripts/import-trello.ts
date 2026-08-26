// Переносит доску из экспорта Trello:  pnpm import:trello <файл.json>
// Разбор входа и печать итога — здесь, вся работа — в сервисе.
import './load-env.ts'
import { readFileSync } from 'node:fs'
import { importTrelloBoard } from '../src/server/services/trello-import.ts'
import { ConflictError, InvalidInputError } from '../src/server/services/errors.ts'

const file = process.argv[2]
if (!file) {
  console.error('нужен путь к файлу: pnpm import:trello <файл.json>')
  process.exit(1)
}

let raw: unknown
try {
  raw = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`не читается ${file}: ${(error as Error).message}`)
  process.exit(1)
}

try {
  const s = await importTrelloBoard(raw)
  console.log(`Доска «${s.title}» перенесена, id ${s.boardId}`)
  console.log(`  списков      ${s.lists}${s.archivedLists ? ` (в архиве ${s.archivedLists})` : ''}`)
  console.log(`  карточек     ${s.cards}${s.archivedCards ? ` (в архиве ${s.archivedCards})` : ''}`)
  console.log(`  меток        ${s.labels}, проставлено на карточках ${s.cardLabels}`)
  console.log(`  чек-листов   ${s.checklists}, пунктов ${s.checklistItems}`)
  if (s.skippedLabels) console.log(`  пропущено меток без цвета: ${s.skippedLabels}`)
  console.log('\nПроверить глазами: pnpm db:studio')
  process.exit(0)
} catch (error) {
  if (error instanceof ConflictError || error instanceof InvalidInputError) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
