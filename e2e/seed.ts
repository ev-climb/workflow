import { testDatabaseUrl } from '../vitest.env.ts'
import { BOARD, DOING, DOING_CARDS, EMPTY_BOARD, TODO, TODO_CARDS } from './fixture.ts'

/**
 * Доска под сценарии. Раскладка одна и та же перед каждым: иначе второй сценарий зависит
 * от того, что натворил первый. Данные заводятся сервисами, а не вставками — ранги
 * считает только сервис (инвариант 2).
 */
export async function seed() {
  // клиент базы читает DATABASE_URL на старте модуля: сервисы импортируются после подмены
  process.env.DATABASE_URL = testDatabaseUrl()

  const { sql } = await import('drizzle-orm')
  const { db } = await import('../src/server/db/client.ts')
  const { createBoard, createList } = await import('../src/server/services/boards.ts')
  const { createCard } = await import('../src/server/services/cards.ts')
  const { setBoardSlot } = await import('../src/server/services/workspace.ts')

  await db.execute(
    sql`truncate boards, google_accounts, workspace_state, notes, note_folders
        restart identity cascade`,
  )

  const board = await createBoard({ title: BOARD })
  for (const [title, titles] of [
    [TODO, TODO_CARDS],
    [DOING, DOING_CARDS],
  ] as const) {
    const list = await createList({ boardId: board.id, title })
    for (const card of titles) await createCard({ listId: list.id, title: card })
  }

  const empty = await createBoard({ title: EMPTY_BOARD })
  await setBoardSlot('top', board.id)
  await setBoardSlot('bottom', empty.id)
}
