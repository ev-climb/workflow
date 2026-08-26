import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { boards, cards, lists } from '@/server/db/schema'
import { InvalidInputError, NotFoundError } from './errors'
import { rankAfter, withRankRetry } from './rank'

const TITLE_MAX = 512

function title(raw: string, what: string): string {
  const value = raw.trim()
  if (!value) throw new InvalidInputError(`${what}: заголовок пустой`)
  if (value.length > TITLE_MAX) {
    throw new InvalidInputError(`${what}: заголовок длиннее ${TITLE_MAX} символов`)
  }
  return value
}

export type BoardSummary = {
  id: string
  title: string
  rank: string
}

export type BoardWithLists = BoardSummary & {
  lists: {
    id: string
    title: string
    rank: string
    wipLimit: number | null
    cards: {
      id: string
      title: string
      rank: string
      dueAt: Date | null
      dueDone: boolean
    }[]
  }[]
}

/** Доски в порядке рангов. Заархивированные не показываются. */
export async function listBoards(): Promise<BoardSummary[]> {
  return db
    .select({ id: boards.id, title: boards.title, rank: boards.rank })
    .from(boards)
    .where(isNull(boards.archivedAt))
    .orderBy(asc(boards.rank))
}

/**
 * Доска со списками и карточками, всё в порядке рангов. Заархивированное скрыто.
 * Три запроса вместо джойна: карточек на порядок больше, чем списков, и джойн
 * размножил бы заголовок списка на каждую карточку.
 */
export async function getBoard(boardId: string): Promise<BoardWithLists> {
  const [board] = await db
    .select({ id: boards.id, title: boards.title, rank: boards.rank })
    .from(boards)
    .where(and(eq(boards.id, boardId), isNull(boards.archivedAt)))

  if (!board) throw new NotFoundError(`доски ${boardId} нет`)

  const boardLists = await db
    .select({
      id: lists.id,
      title: lists.title,
      rank: lists.rank,
      wipLimit: lists.wipLimit,
    })
    .from(lists)
    .where(and(eq(lists.boardId, boardId), isNull(lists.archivedAt)))
    .orderBy(asc(lists.rank))

  const boardCards = boardLists.length
    ? await db
        .select({
          id: cards.id,
          listId: cards.listId,
          title: cards.title,
          rank: cards.rank,
          dueAt: cards.dueAt,
          dueDone: cards.dueDone,
        })
        .from(cards)
        .innerJoin(lists, eq(cards.listId, lists.id))
        .where(and(eq(lists.boardId, boardId), isNull(cards.archivedAt), isNull(lists.archivedAt)))
        .orderBy(asc(cards.rank))
    : []

  const byList = new Map<string, BoardWithLists['lists'][number]['cards']>()
  for (const { listId, ...card } of boardCards) {
    const bucket = byList.get(listId)
    if (bucket) bucket.push(card)
    else byList.set(listId, [card])
  }

  return {
    ...board,
    lists: boardLists.map((list) => ({ ...list, cards: byList.get(list.id) ?? [] })),
  }
}

/** Новая доска встаёт в конец списка досок. */
export async function createBoard(input: { title: string }): Promise<BoardSummary> {
  const name = title(input.title, 'доска')

  return withRankRetry(async () => {
    const [last] = await db
      .select({ rank: boards.rank })
      .from(boards)
      .orderBy(desc(boards.rank))
      .limit(1)

    const [created] = await db
      .insert(boards)
      .values({ title: name, rank: rankAfter(last?.rank ?? null) })
      .returning({ id: boards.id, title: boards.title, rank: boards.rank })

    return created
  })
}

export async function renameBoard(boardId: string, newTitle: string): Promise<BoardSummary> {
  const name = title(newTitle, 'доска')

  const [updated] = await db
    .update(boards)
    .set({ title: name, updatedAt: new Date() })
    .where(and(eq(boards.id, boardId), isNull(boards.archivedAt)))
    .returning({ id: boards.id, title: boards.title, rank: boards.rank })

  if (!updated) throw new NotFoundError(`доски ${boardId} нет`)
  return updated
}

export type ListSummary = {
  id: string
  title: string
  rank: string
  wipLimit: number | null
}

/** Новый список встаёт в конец доски. */
export async function createList(input: {
  boardId: string
  title: string
  wipLimit?: number | null
}): Promise<ListSummary> {
  const name = title(input.title, 'список')
  const wipLimit = input.wipLimit ?? null
  if (wipLimit !== null && (!Number.isInteger(wipLimit) || wipLimit < 1)) {
    throw new InvalidInputError(`лимит списка: нужно целое от единицы, а не ${wipLimit}`)
  }

  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, input.boardId), isNull(boards.archivedAt)))
  if (!board) throw new NotFoundError(`доски ${input.boardId} нет`)

  return withRankRetry(async () => {
    const [last] = await db
      .select({ rank: lists.rank })
      .from(lists)
      .where(eq(lists.boardId, input.boardId))
      .orderBy(desc(lists.rank))
      .limit(1)

    const [created] = await db
      .insert(lists)
      .values({
        boardId: input.boardId,
        title: name,
        rank: rankAfter(last?.rank ?? null),
        wipLimit,
      })
      .returning({
        id: lists.id,
        title: lists.title,
        rank: lists.rank,
        wipLimit: lists.wipLimit,
      })

    return created
  })
}

export async function renameList(listId: string, newTitle: string): Promise<ListSummary> {
  const name = title(newTitle, 'список')

  const [updated] = await db
    .update(lists)
    .set({ title: name, updatedAt: new Date() })
    .where(and(eq(lists.id, listId), isNull(lists.archivedAt)))
    .returning({
      id: lists.id,
      title: lists.title,
      rank: lists.rank,
      wipLimit: lists.wipLimit,
    })

  if (!updated) throw new NotFoundError(`списка ${listId} нет`)
  return updated
}
