import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.ts'
import {
  boards,
  cardLabels,
  cards,
  checklistItems,
  checklists,
  labels,
  lists,
} from '../db/schema.ts'
import { ConflictError, InvalidInputError } from './errors.ts'
import { rankAfter, rankSequence } from './rank.ts'

const checkItem = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  pos: z.number(),
})

const checklist = z.object({
  id: z.string(),
  idCard: z.string(),
  name: z.string(),
  pos: z.number(),
  checkItems: z.array(checkItem).default([]),
})

const card = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().default(''),
  closed: z.boolean().default(false),
  dateClosed: z.string().nullish(),
  due: z.string().nullish(),
  dueComplete: z.boolean().default(false),
  idList: z.string(),
  idLabels: z.array(z.string()).default([]),
  pos: z.number(),
})

const list = z.object({
  id: z.string(),
  name: z.string(),
  closed: z.boolean().default(false),
  pos: z.number(),
  softLimit: z.number().nullish(),
})

const label = z.object({
  id: z.string(),
  name: z.string().default(''),
  color: z.string().nullish(),
})

export const trelloExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  closed: z.boolean().default(false),
  lists: z.array(list),
  cards: z.array(card),
  labels: z.array(label).default([]),
  checklists: z.array(checklist).default([]),
})

export type TrelloExport = z.infer<typeof trelloExportSchema>

export type ImportSummary = {
  boardId: string
  title: string
  lists: number
  archivedLists: number
  cards: number
  archivedCards: number
  labels: number
  cardLabels: number
  checklists: number
  checklistItems: number
  skippedLabels: number
}

export function parseTrelloExport(raw: unknown): TrelloExport {
  const parsed = trelloExportSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new InvalidInputError(
      `это не похоже на экспорт доски Trello: ${first?.path.join('.') || '<корень>'} — ${first?.message}`,
    )
  }
  return parsed.data
}

const byPos = <T extends { pos: number; id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1))

// у postgres потолок в 65535 параметров на запрос: доска в тысячу карточек его пробивает
const CHUNK = 500
async function insertAll<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK))
}

/**
 * Переносит доску целиком, одной транзакцией. Комментарии, вложения и историю действий
 * не берём — их в модели нет. Ранги проставляются заново по порядку `pos` из экспорта.
 */
export async function importTrelloBoard(raw: unknown): Promise<ImportSummary> {
  const source = parseTrelloExport(raw)

  const [existing] = await db
    .select({ id: boards.id, title: boards.title })
    .from(boards)
    .where(eq(boards.trelloId, source.id))

  if (existing) {
    throw new ConflictError(
      `доска Trello ${source.id} уже импортирована как «${existing.title}» (${existing.id}). ` +
        'Повторный импорт слил бы правки, сделанные здесь, с состоянием из файла — ' +
        'удали доску и импортируй заново, если это то, что нужно.',
    )
  }

  const now = new Date()

  return db.transaction(async (tx) => {
    const [lastBoard] = await tx
      .select({ rank: boards.rank })
      .from(boards)
      .orderBy(desc(boards.rank))
      .limit(1)

    const [board] = await tx
      .insert(boards)
      .values({
        title: source.name,
        rank: rankAfter(lastBoard?.rank ?? null),
        trelloId: source.id,
        archivedAt: source.closed ? now : null,
      })
      .returning({ id: boards.id })

    // метка без цвета не отрисуется, а хранить её нечем: в модели цвет обязателен
    const usableLabels = source.labels.filter((l) => l.color)
    const labelIds = new Map<string, string>()
    if (usableLabels.length) {
      const rows = await tx
        .insert(labels)
        .values(
          usableLabels.map((l) => ({
            boardId: board.id,
            name: l.name,
            color: l.color as string,
          })),
        )
        .returning({ id: labels.id })
      usableLabels.forEach((l, i) => labelIds.set(l.id, rows[i].id))
    }

    const sourceLists = byPos(source.lists)
    const listRanks = rankSequence(sourceLists.length)
    const listIds = new Map<string, string>()
    if (sourceLists.length) {
      const rows = await tx
        .insert(lists)
        .values(
          sourceLists.map((l, i) => ({
            boardId: board.id,
            title: l.name,
            rank: listRanks[i],
            wipLimit: l.softLimit && l.softLimit > 0 ? l.softLimit : null,
            archivedAt: l.closed ? now : null,
          })),
        )
        .returning({ id: lists.id })
      sourceLists.forEach((l, i) => listIds.set(l.id, rows[i].id))
    }

    const orphan = source.cards.find((c) => !listIds.has(c.idList))
    if (orphan) {
      throw new InvalidInputError(
        `карточка «${orphan.name}» ссылается на список ${orphan.idList}, которого нет в экспорте`,
      )
    }

    const cardIds = new Map<string, string>()
    for (const sourceList of sourceLists) {
      const inList = byPos(source.cards.filter((c) => c.idList === sourceList.id))
      if (!inList.length) continue

      const ranks = rankSequence(inList.length)
      const rows: { id: string }[] = []
      await insertAll(
        inList.map((c, i) => ({
          listId: listIds.get(sourceList.id) as string,
          title: c.name,
          description: c.desc || null,
          rank: ranks[i],
          dueAt: c.due ? new Date(c.due) : null,
          dueDone: c.dueComplete,
          archivedAt: c.closed ? (c.dateClosed ? new Date(c.dateClosed) : now) : null,
        })),
        async (chunk) => {
          rows.push(...(await tx.insert(cards).values(chunk).returning({ id: cards.id })))
        },
      )
      inList.forEach((c, i) => cardIds.set(c.id, rows[i].id))
    }

    const links = source.cards.flatMap((c) =>
      c.idLabels
        .filter((id) => labelIds.has(id))
        .map((id) => ({
          cardId: cardIds.get(c.id) as string,
          labelId: labelIds.get(id) as string,
        })),
    )
    await insertAll(links, (chunk) => tx.insert(cardLabels).values(chunk))

    let itemCount = 0
    const byCard = new Map<string, typeof source.checklists>()
    for (const cl of source.checklists) {
      if (!cardIds.has(cl.idCard)) continue
      const bucket = byCard.get(cl.idCard)
      if (bucket) bucket.push(cl)
      else byCard.set(cl.idCard, [cl])
    }

    for (const [trelloCardId, group] of byCard) {
      const ordered = byPos(group)
      const ranks = rankSequence(ordered.length)
      const rows = await tx
        .insert(checklists)
        .values(
          ordered.map((cl, i) => ({
            cardId: cardIds.get(trelloCardId) as string,
            title: cl.name,
            rank: ranks[i],
          })),
        )
        .returning({ id: checklists.id })

      for (const [i, cl] of ordered.entries()) {
        const items = byPos(cl.checkItems)
        if (!items.length) continue
        const itemRanks = rankSequence(items.length)
        await insertAll(
          items.map((item, j) => ({
            checklistId: rows[i].id,
            title: item.name,
            done: item.state === 'complete',
            rank: itemRanks[j],
          })),
          (chunk) => tx.insert(checklistItems).values(chunk),
        )
        itemCount += items.length
      }
    }

    return {
      boardId: board.id,
      title: source.name,
      lists: sourceLists.length,
      archivedLists: sourceLists.filter((l) => l.closed).length,
      cards: cardIds.size,
      archivedCards: source.cards.filter((c) => c.closed).length,
      labels: usableLabels.length,
      cardLabels: links.length,
      checklists: source.checklists.filter((cl) => cardIds.has(cl.idCard)).length,
      checklistItems: itemCount,
      skippedLabels: source.labels.length - usableLabels.length,
    }
  })
}
