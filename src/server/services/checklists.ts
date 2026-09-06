import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { cards, checklistItems, checklists, lists } from '../db/schema.ts'
import { publishBoardChanged } from './board-events.ts'
import { locateCard } from './cards.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import { moveWithinCollection, rankAfter, withRankRetry } from './rank.ts'
import { title } from './validation.ts'

export type ChecklistItemView = { id: string; title: string; done: boolean; rank: string }

export type ChecklistView = { id: string; title: string; rank: string; items: ChecklistItemView[] }

const CHECKLIST_SELECT = { id: checklists.id, title: checklists.title, rank: checklists.rank }

const ITEM_SELECT = {
  id: checklistItems.id,
  title: checklistItems.title,
  done: checklistItems.done,
  rank: checklistItems.rank,
}

async function locateChecklist(
  checklistId: string,
): Promise<{ id: string; cardId: string; boardId: string }> {
  const [found] = await db
    .select({ id: checklists.id, cardId: checklists.cardId, boardId: lists.boardId })
    .from(checklists)
    .innerJoin(cards, eq(checklists.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(eq(checklists.id, checklistId))

  if (!found) throw new NotFoundError(`чек-листа ${checklistId} нет`)
  return found
}

async function locateItem(
  itemId: string,
): Promise<{ id: string; checklistId: string; cardId: string; boardId: string }> {
  const [found] = await db
    .select({
      id: checklistItems.id,
      checklistId: checklistItems.checklistId,
      cardId: checklists.cardId,
      boardId: lists.boardId,
    })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklistItems.checklistId, checklists.id))
    .innerJoin(cards, eq(checklists.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(eq(checklistItems.id, itemId))

  if (!found) throw new NotFoundError(`пункта ${itemId} нет`)
  return found
}

async function lastChecklistRank(cardId: string): Promise<string | null> {
  const [last] = await db
    .select({ rank: checklists.rank })
    .from(checklists)
    .where(eq(checklists.cardId, cardId))
    .orderBy(sql`${checklists.rank} desc`)
    .limit(1)

  return last?.rank ?? null
}

async function lastItemRank(checklistId: string): Promise<string | null> {
  const [last] = await db
    .select({ rank: checklistItems.rank })
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, checklistId))
    .orderBy(sql`${checklistItems.rank} desc`)
    .limit(1)

  return last?.rank ?? null
}

/** Ранг соседа. Пункт из другого чек-листа — ошибка входа: позиция была бы выдумана. */
async function neighbourRank(
  itemId: string | null | undefined,
  checklistId: string,
  side: string,
): Promise<string | null> {
  if (!itemId) return null

  const [found] = await db
    .select({ rank: checklistItems.rank, checklistId: checklistItems.checklistId })
    .from(checklistItems)
    .where(eq(checklistItems.id, itemId))

  if (!found) throw new NotFoundError(`соседа ${side} (${itemId}) нет`)
  if (found.checklistId !== checklistId) {
    throw new InvalidInputError(`сосед ${side} (${itemId}) лежит в другом чек-листе`)
  }
  return found.rank
}

/** Ранг, который сейчас идёт следом за `after`. `null` слева — начало чек-листа. */
async function nextRankInChecklist(
  checklistId: string,
  after: string | null,
): Promise<string | null> {
  const [next] = await db
    .select({ rank: checklistItems.rank })
    .from(checklistItems)
    .where(
      and(
        eq(checklistItems.checklistId, checklistId),
        after === null ? undefined : gt(checklistItems.rank, after),
      ),
    )
    .orderBy(asc(checklistItems.rank))
    .limit(1)

  return next?.rank ?? null
}

/** Чек-листы карточки с пунктами, всё в порядке рангов. В доске от них только прогресс. */
export async function listChecklists(cardId: string): Promise<ChecklistView[]> {
  const rows = await db
    .select({ ...CHECKLIST_SELECT, cardId: checklists.cardId })
    .from(checklists)
    .where(eq(checklists.cardId, cardId))
    .orderBy(asc(checklists.rank))

  if (!rows.length) return []

  const items = await db
    .select({ ...ITEM_SELECT, checklistId: checklistItems.checklistId })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklistItems.checklistId, checklists.id))
    .where(eq(checklists.cardId, cardId))
    .orderBy(asc(checklistItems.rank))

  const byChecklist = new Map<string, ChecklistItemView[]>()
  for (const { checklistId, ...item } of items) {
    const bucket = byChecklist.get(checklistId)
    if (bucket) bucket.push(item)
    else byChecklist.set(checklistId, [item])
  }

  return rows.map(({ cardId: _cardId, ...checklist }) => ({
    ...checklist,
    items: byChecklist.get(checklist.id) ?? [],
  }))
}

/** Новый чек-лист встаёт в конец карточки. */
export async function createChecklist(input: {
  cardId: string
  title: string
}): Promise<ChecklistView> {
  const name = title(input.title, 'чек-лист')
  const card = await locateCard(input.cardId)

  const created = await withRankRetry(async () => {
    const [inserted] = await db
      .insert(checklists)
      .values({
        cardId: input.cardId,
        title: name,
        rank: rankAfter(await lastChecklistRank(input.cardId)),
      })
      .returning(CHECKLIST_SELECT)

    return inserted
  })

  publishBoardChanged(card.boardId)
  return { ...created, items: [] }
}

export async function renameChecklist(
  checklistId: string,
  newTitle: string,
): Promise<{ id: string; title: string; rank: string }> {
  const name = title(newTitle, 'чек-лист')
  const checklist = await locateChecklist(checklistId)

  const [updated] = await db
    .update(checklists)
    .set({ title: name, updatedAt: new Date() })
    .where(eq(checklists.id, checklistId))
    .returning(CHECKLIST_SELECT)

  publishBoardChanged(checklist.boardId)
  return updated
}

/**
 * Чек-лист удаляется совсем, а не прячется: инвариант 5 про содержимое доски, а чек-лист —
 * часть карточки, своего архива у него нет. Пункты уносит `on delete cascade`.
 */
export async function deleteChecklist(checklistId: string): Promise<{ id: string }> {
  const checklist = await locateChecklist(checklistId)

  const [removed] = await db
    .delete(checklists)
    .where(eq(checklists.id, checklistId))
    .returning({ id: checklists.id })

  publishBoardChanged(checklist.boardId)
  return removed
}

/** Новый пункт встаёт в конец чек-листа. Сразу выполненным он заводится из MCP. */
export async function addChecklistItem(input: {
  checklistId: string
  title: string
  done?: boolean
}): Promise<ChecklistItemView> {
  const name = title(input.title, 'пункт')
  const checklist = await locateChecklist(input.checklistId)

  const created = await withRankRetry(async () => {
    const [inserted] = await db
      .insert(checklistItems)
      .values({
        checklistId: input.checklistId,
        title: name,
        done: input.done ?? false,
        rank: rankAfter(await lastItemRank(input.checklistId)),
      })
      .returning(ITEM_SELECT)

    return inserted
  })

  publishBoardChanged(checklist.boardId)
  return created
}

/** Заголовок и отметка правятся вместе или порознь: пустая правка до базы не доходит. */
export async function updateChecklistItem(
  itemId: string,
  changes: { title?: string; done?: boolean },
): Promise<ChecklistItemView> {
  const patch: { title?: string; done?: boolean } = {}
  if (changes.title !== undefined) patch.title = title(changes.title, 'пункт')
  if (changes.done !== undefined) patch.done = changes.done
  if (!Object.keys(patch).length) throw new InvalidInputError('пункт: править нечего')

  const item = await locateItem(itemId)

  const [updated] = await db
    .update(checklistItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId))
    .returning(ITEM_SELECT)

  publishBoardChanged(item.boardId)
  return updated
}

/**
 * Перестановка пункта: внутри чек-листа и между чек-листами одной карточки. Ранг считается
 * здесь и никогда не приходит с клиента — инвариант 1 распространяется и на пункты.
 * Запись — один UPDATE одной строки.
 */
export async function moveChecklistItem(input: {
  itemId: string
  checklistId: string
  prevItemId?: string | null
  nextItemId?: string | null
}): Promise<ChecklistItemView & { checklistId: string }> {
  const item = await locateItem(input.itemId)
  const target = await locateChecklist(input.checklistId)

  if (target.cardId !== item.cardId) {
    throw new InvalidInputError('пункт переставляется только внутри своей карточки')
  }

  if (input.prevItemId === input.itemId || input.nextItemId === input.itemId) {
    throw new InvalidInputError('пункт не может быть соседом самому себе')
  }

  const prev = await neighbourRank(input.prevItemId, input.checklistId, 'слева')
  const next = await neighbourRank(input.nextItemId, input.checklistId, 'справа')

  const moved = await moveWithinCollection(
    { prev, next },
    (after) => nextRankInChecklist(input.checklistId, after),
    async (rank) => {
      const [updated] = await db
        .update(checklistItems)
        .set({ checklistId: input.checklistId, rank, updatedAt: new Date() })
        .where(eq(checklistItems.id, input.itemId))
        .returning({ ...ITEM_SELECT, checklistId: checklistItems.checklistId })

      return updated
    },
  )

  publishBoardChanged(item.boardId)
  return moved
}

export async function deleteChecklistItem(itemId: string): Promise<{ id: string }> {
  const item = await locateItem(itemId)

  const [removed] = await db
    .delete(checklistItems)
    .where(eq(checklistItems.id, itemId))
    .returning({ id: checklistItems.id })

  publishBoardChanged(item.boardId)
  return removed
}
