import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { boards, cardLabels, cards, labels, lists } from '../db/schema.ts'
import { publishBoardChanged } from './board-events.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import { rankAfter, rankBetween, withRankRetry } from './rank.ts'

const TITLE_MAX = 512

/** Столько же, сколько у описания в Trello: привезённое импортом должно влезать. */
const DESCRIPTION_MAX = 16_384

function title(raw: string): string {
  const value = raw.trim()
  if (!value) throw new InvalidInputError('карточка: заголовок пустой')
  if (value.length > TITLE_MAX) {
    throw new InvalidInputError(`карточка: заголовок длиннее ${TITLE_MAX} символов`)
  }
  return value
}

export type CardPosition = { id: string; listId: string; rank: string }

export type LabelRef = { id: string; name: string; color: string }

async function locateCard(
  cardId: string,
): Promise<{ id: string; listId: string; rank: string; boardId: string }> {
  const [found] = await db
    .select({ id: cards.id, listId: cards.listId, rank: cards.rank, boardId: lists.boardId })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))

  if (!found) throw new NotFoundError(`карточки ${cardId} нет или она в архиве`)
  return found
}

async function locateList(listId: string): Promise<{ id: string; boardId: string }> {
  const [found] = await db
    .select({ id: lists.id, boardId: lists.boardId })
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.archivedAt)))

  if (!found) throw new NotFoundError(`списка ${listId} нет или он в архиве`)
  return found
}

/** Доска карточки без оглядки на архив: событие рассылается и после того, как её убрали. */
async function boardOfCard(cardId: string): Promise<string> {
  const [found] = await db
    .select({ boardId: lists.boardId })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(eq(cards.id, cardId))

  if (!found) throw new NotFoundError(`карточки ${cardId} нет`)
  return found.boardId
}

/** Доска живой карточки. `null` — карточки нет или она в архиве: ссылка могла протухнуть. */
export async function findCardBoard(cardId: string): Promise<string | null> {
  const [found] = await db
    .select({ boardId: lists.boardId })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))

  return found?.boardId ?? null
}

/** Ранг соседа. Чужой список или архив — ошибка входа: позиция была бы выдумана. */
async function neighbourRank(
  cardId: string | null | undefined,
  listId: string,
  side: string,
): Promise<string | null> {
  if (!cardId) return null

  const [found] = await db
    .select({ rank: cards.rank, listId: cards.listId })
    .from(cards)
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))

  if (!found) throw new NotFoundError(`соседа ${side} (${cardId}) нет или он в архиве`)
  if (found.listId !== listId) {
    throw new InvalidInputError(`сосед ${side} (${cardId}) лежит в другом списке`)
  }
  return found.rank
}

/** Ранг последней карточки списка. */
async function lastRank(listId: string): Promise<string | null> {
  const [last] = await db
    .select({ rank: cards.rank })
    .from(cards)
    .where(eq(cards.listId, listId))
    .orderBy(sql`${cards.rank} desc`)
    .limit(1)

  return last?.rank ?? null
}

/**
 * Ранг, который сейчас идёт следом за `after`. `null` слева — начало списка.
 * Архив считается наравне с видимым: ранг архивной карточки занят в уникальном индексе,
 * и место между двумя видимыми соседями бывает занято именно им.
 */
async function nextRankInList(listId: string, after: string | null): Promise<string | null> {
  const [next] = await db
    .select({ rank: cards.rank })
    .from(cards)
    .where(and(eq(cards.listId, listId), after === null ? undefined : gt(cards.rank, after)))
    .orderBy(asc(cards.rank))
    .limit(1)

  return next?.rank ?? null
}

export type CardDetail = {
  id: string
  title: string
  description: string | null
  dueAt: Date | null
  dueDone: boolean
  boardId: string
  boardTitle: string
  listId: string
  listTitle: string
  labels: LabelRef[]
}

/**
 * Карточка целиком: описание и собственные метки, которых в доске нет, — там лежат
 * только значки, — плюс место, где карточка живёт. Панель читает её отдельным запросом.
 */
export async function getCard(cardId: string): Promise<CardDetail> {
  const [found] = await db
    .select({
      id: cards.id,
      title: cards.title,
      description: cards.description,
      dueAt: cards.dueAt,
      dueDone: cards.dueDone,
      boardId: boards.id,
      boardTitle: boards.title,
      listId: cards.listId,
      listTitle: lists.title,
    })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))

  if (!found) throw new NotFoundError(`карточки ${cardId} нет или она в архиве`)

  const own = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(cardLabels)
    .innerJoin(labels, eq(cardLabels.labelId, labels.id))
    .where(eq(cardLabels.cardId, cardId))
    .orderBy(asc(labels.name), asc(labels.color))

  return { ...found, labels: own }
}

export async function createCard(input: { listId: string; title: string }): Promise<CardPosition> {
  const name = title(input.title)
  const target = await locateList(input.listId)

  const created = await withRankRetry(async () => {
    const [inserted] = await db
      .insert(cards)
      .values({ listId: input.listId, title: name, rank: rankAfter(await lastRank(input.listId)) })
      .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

    return inserted
  })

  publishBoardChanged(target.boardId)
  return created
}

export async function renameCard(cardId: string, newTitle: string): Promise<CardPosition> {
  const name = title(newTitle)
  const card = await locateCard(cardId)

  const [updated] = await db
    .update(cards)
    .set({ title: name, updatedAt: new Date() })
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))
    .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

  if (!updated) throw new NotFoundError(`карточки ${cardId} нет или она в архиве`)

  publishBoardChanged(card.boardId)
  return updated
}

/**
 * Описание карточки. Пустой текст ложится в базу как `null`, а не пустая строка: в доске
 * значок «есть описание» смотрит именно на `null`, и пробел иначе зажигал бы его впустую.
 */
export async function describeCard(cardId: string, raw: string | null): Promise<{ id: string }> {
  const value = raw?.trim() ?? ''
  if (value.length > DESCRIPTION_MAX) {
    throw new InvalidInputError(`карточка: описание длиннее ${DESCRIPTION_MAX} символов`)
  }

  const card = await locateCard(cardId)

  const [updated] = await db
    .update(cards)
    .set({ description: value || null, updatedAt: new Date() })
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))
    .returning({ id: cards.id })

  if (!updated) throw new NotFoundError(`карточки ${cardId} нет или она в архиве`)

  publishBoardChanged(card.boardId)
  return updated
}

/**
 * Перемещение внутри доски: между позициями в списке и между списками.
 * Ранг считается здесь и никогда не приходит с клиента — иначе у MCP из фазы 06
 * появится вторая реализация того же правила. Запись — один UPDATE одной строки.
 */
export async function moveCard(input: {
  cardId: string
  listId: string
  prevCardId?: string | null
  nextCardId?: string | null
}): Promise<CardPosition> {
  const card = await locateCard(input.cardId)
  const target = await locateList(input.listId)

  if (target.boardId !== card.boardId) {
    throw new InvalidInputError(
      'перетаскиванием карточка не переносится на другую доску: у досок разные метки, ' +
        'нужен moveCardToBoard с явным подтверждением (ADR-005)',
    )
  }

  if (input.prevCardId === input.cardId || input.nextCardId === input.cardId) {
    throw new InvalidInputError('карточка не может быть соседом самой себе')
  }

  const prev = await neighbourRank(input.prevCardId, input.listId, 'слева')
  let next = await neighbourRank(input.nextCardId, input.listId, 'справа')
  let attempt = 0

  const moved = await withRankRetry(async () => {
    // соседи те же, значит между ними успели встать: берём того, кто стоит там теперь
    if (attempt++) next = await nextRankInList(input.listId, prev)

    const [updated] = await db
      .update(cards)
      .set({ listId: input.listId, rank: rankBetween(prev, next), updatedAt: new Date() })
      .where(and(eq(cards.id, input.cardId), isNull(cards.archivedAt)))
      .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

    if (!updated) throw new NotFoundError(`карточки ${input.cardId} нет или она в архиве`)
    return updated
  })

  publishBoardChanged(card.boardId)
  return moved
}

/** Какие метки отвалятся при переносе. Диалог показывает это до подтверждения (ADR-005). */
export async function previewBoardMove(
  cardId: string,
  targetListId: string,
): Promise<{ droppedLabels: LabelRef[]; keptLabels: LabelRef[] }> {
  const card = await locateCard(cardId)
  const target = await locateList(targetListId)

  const own = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(cardLabels)
    .innerJoin(labels, eq(cardLabels.labelId, labels.id))
    .where(eq(cardLabels.cardId, cardId))

  if (target.boardId === card.boardId) return { droppedLabels: [], keptLabels: own }

  const theirs = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.boardId, target.boardId))

  const key = (l: { name: string; color: string }) => `${l.name}\u0000${l.color}`
  const available = new Map(theirs.map((l) => [key(l), l]))

  const droppedLabels: LabelRef[] = []
  const keptLabels: LabelRef[] = []
  for (const label of own) {
    const twin = available.get(key(label))
    if (twin) keptLabels.push(twin)
    else droppedLabels.push(label)
  }
  return { droppedLabels, keptLabels }
}

/**
 * Перенос на другую доску: смена списка плюс снятие меток, которых на доске-приёмнике
 * нет. Метка с тем же названием и цветом считается той же и переезжает на двойника —
 * иначе перенос терял бы её на ровном месте.
 */
export async function moveCardToBoard(input: {
  cardId: string
  listId: string
}): Promise<CardPosition & { droppedLabels: LabelRef[] }> {
  const card = await locateCard(input.cardId)
  const target = await locateList(input.listId)

  if (target.boardId === card.boardId) {
    const moved = await moveCard({ cardId: input.cardId, listId: input.listId })
    return { ...moved, droppedLabels: [] }
  }

  const { droppedLabels, keptLabels } = await previewBoardMove(input.cardId, input.listId)
  const rank = rankAfter(await lastRank(input.listId))

  const moved = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(cards)
      .set({ listId: input.listId, rank, updatedAt: new Date() })
      .where(eq(cards.id, input.cardId))
      .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

    await tx.delete(cardLabels).where(eq(cardLabels.cardId, input.cardId))
    if (keptLabels.length) {
      await tx
        .insert(cardLabels)
        .values(keptLabels.map((l) => ({ cardId: input.cardId, labelId: l.id })))
    }

    return { ...updated, droppedLabels }
  })

  // карточка ушла с одной доски на другую: перечитать надо обе
  publishBoardChanged(card.boardId)
  publishBoardChanged(target.boardId)
  return moved
}

export async function archiveCard(cardId: string): Promise<{ id: string }> {
  const now = new Date()

  const [archived] = await db
    .update(cards)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))
    .returning({ id: cards.id })

  if (!archived) throw new NotFoundError(`карточки ${cardId} нет или она уже в архиве`)

  publishBoardChanged(await boardOfCard(cardId))
  return archived
}

/** Возвращает карточку в конец её исходного списка. */
export async function restoreCard(cardId: string): Promise<CardPosition> {
  const [found] = await db
    .select({
      id: cards.id,
      listId: cards.listId,
      boardId: lists.boardId,
      listArchivedAt: lists.archivedAt,
    })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(and(eq(cards.id, cardId), sql`${cards.archivedAt} is not null`))

  if (!found) throw new NotFoundError(`карточки ${cardId} нет в архиве`)
  if (found.listArchivedAt) {
    throw new InvalidInputError('список карточки в архиве — сначала восстанови список')
  }

  const restored = await withRankRetry(async () => {
    const [updated] = await db
      .update(cards)
      .set({
        archivedAt: null,
        rank: rankAfter(await lastRank(found.listId)),
        updatedAt: new Date(),
      })
      .where(eq(cards.id, cardId))
      .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

    return updated
  })

  publishBoardChanged(found.boardId)
  return restored
}
