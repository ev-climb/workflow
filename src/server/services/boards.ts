import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm'
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
import { InvalidInputError, NotFoundError } from './errors.ts'
import { rankAfter, withRankRetry } from './rank.ts'

const TITLE_MAX = 512

function title(raw: string, what: string): string {
  const value = raw.trim()
  if (!value) throw new InvalidInputError(`${what}: заголовок пустой`)
  if (value.length > TITLE_MAX) {
    throw new InvalidInputError(`${what}: заголовок длиннее ${TITLE_MAX} символов`)
  }
  return value
}

function wipLimit(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidInputError(`лимит списка: нужно целое от единицы, а не ${value}`)
  }
  return value
}

export type BoardSummary = { id: string; title: string; rank: string }

export type LabelSummary = { id: string; name: string; color: string }

export type BoardCard = {
  id: string
  title: string
  rank: string
  dueAt: Date | null
  dueDone: boolean
  hasDescription: boolean
  checklistDone: number
  checklistTotal: number
  labels: LabelSummary[]
}

export type BoardList = {
  id: string
  title: string
  rank: string
  wipLimit: number | null
  cards: BoardCard[]
}

export type BoardWithLists = BoardSummary & {
  labels: LabelSummary[]
  lists: BoardList[]
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
 * Метки, описание и прогресс чек-листов приходят значками: списку карточек нужен факт
 * «описание есть», а не сам текст на полтора килобайта.
 */
export async function getBoard(boardId: string): Promise<BoardWithLists> {
  const [board] = await db
    .select({ id: boards.id, title: boards.title, rank: boards.rank })
    .from(boards)
    .where(and(eq(boards.id, boardId), isNull(boards.archivedAt)))

  if (!board) throw new NotFoundError(`доски ${boardId} нет`)

  const boardLabels = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.boardId, boardId))
    .orderBy(asc(labels.name), asc(labels.color))

  const boardLists = await db
    .select({ id: lists.id, title: lists.title, rank: lists.rank, wipLimit: lists.wipLimit })
    .from(lists)
    .where(and(eq(lists.boardId, boardId), isNull(lists.archivedAt)))
    .orderBy(asc(lists.rank))

  if (!boardLists.length) return { ...board, labels: boardLabels, lists: [] }

  const visible = and(
    eq(lists.boardId, boardId),
    isNull(cards.archivedAt),
    isNull(lists.archivedAt),
  )

  const boardCards = await db
    .select({
      id: cards.id,
      listId: cards.listId,
      title: cards.title,
      rank: cards.rank,
      dueAt: cards.dueAt,
      dueDone: cards.dueDone,
      hasDescription: sql<boolean>`${cards.description} is not null and ${cards.description} <> ''`,
    })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(visible)
    .orderBy(asc(cards.rank))

  const progress = await db
    .select({
      cardId: checklists.cardId,
      total: count(checklistItems.id),
      done: sql<number>`count(*) filter (where ${checklistItems.done})`,
    })
    .from(checklists)
    .innerJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
    .innerJoin(cards, eq(checklists.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(visible)
    .groupBy(checklists.cardId)

  const marks = await db
    .select({
      cardId: cardLabels.cardId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(cardLabels)
    .innerJoin(labels, eq(cardLabels.labelId, labels.id))
    .innerJoin(cards, eq(cardLabels.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(visible)
    .orderBy(asc(labels.name), asc(labels.color))

  const progressByCard = new Map(progress.map((p) => [p.cardId, p]))
  const labelsByCard = new Map<string, LabelSummary[]>()
  for (const { cardId, ...label } of marks) {
    const bucket = labelsByCard.get(cardId)
    if (bucket) bucket.push(label)
    else labelsByCard.set(cardId, [label])
  }

  const cardsByList = new Map<string, BoardCard[]>()
  for (const { listId, ...card } of boardCards) {
    const counted = progressByCard.get(card.id)
    const enriched: BoardCard = {
      ...card,
      checklistDone: Number(counted?.done ?? 0),
      checklistTotal: Number(counted?.total ?? 0),
      labels: labelsByCard.get(card.id) ?? [],
    }
    const bucket = cardsByList.get(listId)
    if (bucket) bucket.push(enriched)
    else cardsByList.set(listId, [enriched])
  }

  return {
    ...board,
    labels: boardLabels,
    lists: boardLists.map((list) => ({ ...list, cards: cardsByList.get(list.id) ?? [] })),
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

export type ListSummary = { id: string; title: string; rank: string; wipLimit: number | null }

const LIST_SELECT = {
  id: lists.id,
  title: lists.title,
  rank: lists.rank,
  wipLimit: lists.wipLimit,
}

/** Новый список встаёт в конец доски. */
export async function createList(input: {
  boardId: string
  title: string
  wipLimit?: number | null
}): Promise<ListSummary> {
  const name = title(input.title, 'список')
  const limit = wipLimit(input.wipLimit)

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
        wipLimit: limit,
      })
      .returning(LIST_SELECT)

    return created
  })
}

export async function renameList(listId: string, newTitle: string): Promise<ListSummary> {
  const name = title(newTitle, 'список')

  const [updated] = await db
    .update(lists)
    .set({ title: name, updatedAt: new Date() })
    .where(and(eq(lists.id, listId), isNull(lists.archivedAt)))
    .returning(LIST_SELECT)

  if (!updated) throw new NotFoundError(`списка ${listId} нет или он в архиве`)
  return updated
}

/** Список уезжает в архив вместе с содержимым: карточки внутри остаются как были. */
export async function archiveList(listId: string): Promise<{ id: string }> {
  const now = new Date()

  const [archived] = await db
    .update(lists)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(lists.id, listId), isNull(lists.archivedAt)))
    .returning({ id: lists.id })

  if (!archived) throw new NotFoundError(`списка ${listId} нет или он уже в архиве`)
  return archived
}

/** Возвращает список в конец доски: прежнее место могли занять. */
export async function restoreList(listId: string): Promise<ListSummary> {
  const [found] = await db
    .select({ id: lists.id, boardId: lists.boardId })
    .from(lists)
    .where(and(eq(lists.id, listId), sql`${lists.archivedAt} is not null`))

  if (!found) throw new NotFoundError(`списка ${listId} нет в архиве`)

  return withRankRetry(async () => {
    const [last] = await db
      .select({ rank: lists.rank })
      .from(lists)
      .where(and(eq(lists.boardId, found.boardId), isNull(lists.archivedAt)))
      .orderBy(desc(lists.rank))
      .limit(1)

    const [restored] = await db
      .update(lists)
      .set({ archivedAt: null, rank: rankAfter(last?.rank ?? null), updatedAt: new Date() })
      .where(eq(lists.id, listId))
      .returning(LIST_SELECT)

    return restored
  })
}

export type Archive = {
  lists: { id: string; title: string; archivedAt: Date }[]
  cards: { id: string; title: string; listId: string; listTitle: string; archivedAt: Date }[]
}

/** Отдельный экран: что уехало в архив и откуда. Свежее сверху. */
export async function getArchive(boardId: string): Promise<Archive> {
  const [board] = await db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId))
  if (!board) throw new NotFoundError(`доски ${boardId} нет`)

  const archivedLists = await db
    .select({ id: lists.id, title: lists.title, archivedAt: lists.archivedAt })
    .from(lists)
    .where(and(eq(lists.boardId, boardId), sql`${lists.archivedAt} is not null`))
    .orderBy(desc(lists.archivedAt))

  const archivedCards = await db
    .select({
      id: cards.id,
      title: cards.title,
      listId: cards.listId,
      listTitle: lists.title,
      archivedAt: cards.archivedAt,
    })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(and(eq(lists.boardId, boardId), sql`${cards.archivedAt} is not null`))
    .orderBy(desc(cards.archivedAt))

  return {
    lists: archivedLists as Archive['lists'],
    cards: archivedCards as Archive['cards'],
  }
}
