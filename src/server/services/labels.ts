import { and, asc, eq, isNull } from 'drizzle-orm'
import { isLabelColor } from '../../lib/label-colors.ts'
import { db } from '../db/client.ts'
import { boards, cardLabels, cards, labels, lists } from '../db/schema.ts'
import type { LabelSummary } from './boards.ts'
import { publishBoardChanged } from './board-events.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'

const NAME_MAX = 128

/** У метки из Trello бывает только цвет, поэтому пустое имя — норма, а не ошибка входа. */
function labelName(raw: string): string {
  const value = raw.trim()
  if (value.length > NAME_MAX) {
    throw new InvalidInputError(`метка: название длиннее ${NAME_MAX} символов`)
  }
  return value
}

function labelColorName(raw: string): string {
  if (!isLabelColor(raw)) throw new InvalidInputError(`метка: цвета «${raw}» нет в наборе`)
  return raw
}

const LABEL_SELECT = { id: labels.id, name: labels.name, color: labels.color }

function duplicate(error: unknown): boolean {
  const cause = error instanceof Error && error.cause ? error.cause : error
  const { code, constraint_name: constraint } = (cause ?? {}) as Record<string, unknown>
  return code === '23505' && constraint === 'labels_board_id_name_color_key'
}

/** Уникальность (доска, название, цвет) стережёт база — ловим её отказ, а не гадаем заранее. */
async function insertLabel(values: {
  boardId: string
  name: string
  color: string
}): Promise<LabelSummary> {
  try {
    const [inserted] = await db.insert(labels).values(values).returning(LABEL_SELECT)
    return inserted
  } catch (error) {
    if (duplicate(error)) throw new InvalidInputError('такая метка на доске уже есть')
    throw error
  }
}

async function patchLabel(
  labelId: string,
  patch: { name?: string; color?: string },
): Promise<LabelSummary | undefined> {
  try {
    const [updated] = await db
      .update(labels)
      .set(patch)
      .where(eq(labels.id, labelId))
      .returning(LABEL_SELECT)
    return updated
  } catch (error) {
    if (duplicate(error)) throw new InvalidInputError('такая метка на доске уже есть')
    throw error
  }
}

async function boardOfLabel(labelId: string): Promise<string> {
  const [found] = await db
    .select({ boardId: labels.boardId })
    .from(labels)
    .where(eq(labels.id, labelId))

  if (!found) throw new NotFoundError(`метки ${labelId} нет`)
  return found.boardId
}

export async function createLabel(input: {
  boardId: string
  name: string
  color: string
}): Promise<LabelSummary> {
  const name = labelName(input.name)
  const color = labelColorName(input.color)

  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, input.boardId), isNull(boards.archivedAt)))
  if (!board) throw new NotFoundError(`доски ${input.boardId} нет`)

  const created = await insertLabel({ boardId: input.boardId, name, color })

  publishBoardChanged(input.boardId)
  return created
}

/** Название и цвет правятся вместе или порознь: пустая правка до базы не доходит. */
export async function updateLabel(
  labelId: string,
  changes: { name?: string; color?: string },
): Promise<LabelSummary> {
  const patch: { name?: string; color?: string } = {}
  if (changes.name !== undefined) patch.name = labelName(changes.name)
  if (changes.color !== undefined) patch.color = labelColorName(changes.color)
  if (!Object.keys(patch).length) throw new InvalidInputError('метка: править нечего')

  const boardId = await boardOfLabel(labelId)

  const updated = await patchLabel(labelId, patch)
  if (!updated) throw new NotFoundError(`метки ${labelId} нет`)

  publishBoardChanged(boardId)
  return updated
}

/**
 * Метка удаляется совсем, а не прячется: инвариант 5 про содержимое доски, а метка —
 * её справочник. Связи с карточками уносит `on delete cascade`, отдельного обхода нет.
 */
export async function deleteLabel(labelId: string): Promise<{ id: string }> {
  const [removed] = await db
    .delete(labels)
    .where(eq(labels.id, labelId))
    .returning({ id: labels.id, boardId: labels.boardId })

  if (!removed) throw new NotFoundError(`метки ${labelId} нет`)

  publishBoardChanged(removed.boardId)
  return { id: removed.id }
}

async function boardOfCard(cardId: string): Promise<string> {
  const [found] = await db
    .select({ boardId: lists.boardId })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))

  if (!found) throw new NotFoundError(`карточки ${cardId} нет или она в архиве`)
  return found.boardId
}

/**
 * Метка вешается на карточку своей доски. Чужая — ошибка входа: набор принадлежит доске,
 * и на другой доске та же по виду метка это другая строка (ADR-005).
 * Повторное навешивание проходит молча — переключатель не должен падать на гонке.
 */
export async function attachLabel(
  cardId: string,
  labelId: string,
): Promise<{ cardId: string; labelId: string }> {
  const boardId = await boardOfCard(cardId)
  if ((await boardOfLabel(labelId)) !== boardId) {
    throw new InvalidInputError(`метки ${labelId} нет на доске карточки`)
  }

  await db.insert(cardLabels).values({ cardId, labelId }).onConflictDoNothing()

  publishBoardChanged(boardId)
  return { cardId, labelId }
}

/** Снятие метки. Метка проверяется не строже, чем нужно: снятой с карточки она и была. */
export async function detachLabel(
  cardId: string,
  labelId: string,
): Promise<{ cardId: string; labelId: string }> {
  const boardId = await boardOfCard(cardId)

  await db
    .delete(cardLabels)
    .where(and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, labelId)))

  publishBoardChanged(boardId)
  return { cardId, labelId }
}

export async function listLabels(boardId: string): Promise<LabelSummary[]> {
  return db
    .select(LABEL_SELECT)
    .from(labels)
    .where(eq(labels.boardId, boardId))
    .orderBy(asc(labels.name), asc(labels.color))
}
