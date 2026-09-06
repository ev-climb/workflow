import { and, asc, eq, gt, gte, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { isDay, momentInMoscow, moscowParts } from '../../lib/dates.ts'
import { type Db, db, type Tx } from '../db/client.ts'
import { boards, cardLabels, cards, labels, lists } from '../db/schema.ts'
import { publishBoardChanged } from './board-events.ts'
import { parseCardInput } from './card-input.ts'
import { parseDayWindow } from './day-window.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import { moveWithinCollection, rankAfter, withRankRetry } from './rank.ts'
import { retitleCardBlocks, unmirrorCardBlocks } from './time-blocks.ts'
import { title } from './validation.ts'

/** Столько же, сколько у описания в Trello: привезённое импортом должно влезать. */
const DESCRIPTION_MAX = 16_384

export type CardPosition = { id: string; listId: string; rank: string }

export type LabelRef = { id: string; name: string; color: string }

/** Место живой карточки. Чек-листы, вложения и метки опознают её через ту же выборку. */
export async function locateCard(
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

export async function locateList(listId: string): Promise<{ id: string; boardId: string }> {
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
async function lastRank(listId: string, executor: Db | Tx = db): Promise<string | null> {
  const [last] = await executor
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
  dueHasTime: boolean
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
      dueHasTime: cards.dueHasTime,
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

/** Вставка в конец списка. Ранг считается внутри повтора: на гонке он берётся заново. */
function insertCard(
  listId: string,
  name: string,
  due: { at: Date; hasTime: boolean } | null,
): Promise<CardPosition> {
  return withRankRetry(async () => {
    const [inserted] = await db
      .insert(cards)
      .values({
        listId,
        title: name,
        rank: rankAfter(await lastRank(listId)),
        ...(due ? { dueAt: due.at, dueHasTime: due.hasTime } : {}),
      })
      .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

    return inserted
  })
}

export async function createCard(input: { listId: string; title: string }): Promise<CardPosition> {
  const name = title(input.title, 'карточка')
  const target = await locateList(input.listId)

  const created = await insertCard(input.listId, name, null)

  publishBoardChanged(target.boardId)
  return created
}

/**
 * Метки доски по именам из строки быстрого создания. Незнакомое имя — ошибка входа:
 * набор меток задаётся на доске, и выдумывать цвет новой метке здесь неоткуда.
 * Одно имя с двумя цветами разрешается первой меткой в порядке набора.
 */
async function labelsByName(boardId: string, names: string[]): Promise<string[]> {
  const wanted = [...new Set(names.map((name) => name.toLowerCase()))]

  const found = await db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(and(eq(labels.boardId, boardId), inArray(sql`lower(${labels.name})`, wanted)))
    .orderBy(asc(labels.name), asc(labels.color))

  return wanted.map((name) => {
    const match = found.find((label) => label.name.toLowerCase() === name)
    if (!match) throw new InvalidInputError(`карточка: на доске нет метки «${name}»`)
    return match.id
  })
}

/**
 * Карточка из одной строки: заголовок, срок и метки разбираются вместе, кладутся одной
 * вставкой и одним событием доски. Разбор — в `card-input.ts`, чтобы у MCP из фазы 06
 * был тот же путь, а не своё понимание строки.
 */
export async function createCardFromText(input: {
  listId: string
  text: string
}): Promise<CardPosition> {
  const parsed = parseCardInput(input.text)
  const name = title(parsed.title, 'карточка')
  const due = parsed.due === null ? null : dueMoment(parsed.due)
  const target = await locateList(input.listId)
  const chosen = parsed.labels.length ? await labelsByName(target.boardId, parsed.labels) : []

  const created = await insertCard(input.listId, name, due)

  if (chosen.length) {
    await db.insert(cardLabels).values(chosen.map((labelId) => ({ cardId: created.id, labelId })))
  }

  publishBoardChanged(target.boardId)
  return created
}

/**
 * Описание в том виде, в каком оно ложится в базу. Пустой текст становится `null`, а не
 * пустой строкой: в доске значок «есть описание» смотрит именно на `null`, и пробел
 * иначе зажигал бы его впустую.
 */
export function cardDescription(raw: string | null): string | null {
  const value = raw?.trim() ?? ''
  if (value.length > DESCRIPTION_MAX) {
    throw new InvalidInputError(`карточка: описание длиннее ${DESCRIPTION_MAX} символов`)
  }
  return value || null
}

const TIME = /^\d{2}:\d{2}$/

export type DueInput = { date: string; time?: string | null }

/**
 * Момент срока по московским дате и времени. Разложение обратно ловит и несуществующую
 * дату вроде 31 февраля, и время вида 25:70: регулярка их пропускает, а зона — нет.
 */
function dueMoment(input: DueInput): { at: Date; hasTime: boolean } {
  const time = input.time ?? null
  if (!isDay(input.date)) {
    throw new InvalidInputError('карточка: дата срока не вида ГГГГ-ММ-ДД')
  }
  if (time !== null && !TIME.test(time)) {
    throw new InvalidInputError('карточка: время срока не вида ЧЧ:ММ')
  }

  const at = momentInMoscow(input.date, time)
  const shown = Number.isNaN(at.getTime()) ? null : moscowParts(at.toISOString())
  if (!shown || shown.date !== input.date || (time !== null && shown.time !== time)) {
    const shownTime = time ? ` ${time}` : ''
    throw new InvalidInputError(`карточка: такого срока нет — ${input.date}${shownTime}`)
  }

  return { at, hasTime: time !== null }
}

/**
 * Метка принадлежит доске, и на другой доске та же по виду метка это другая строка
 * (ADR-005). Чужая в правке — ошибка входа, а не молчаливый пропуск.
 */
async function checkBoardLabels(boardId: string, labelIds: string[]): Promise<void> {
  const own = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.boardId, boardId), inArray(labels.id, labelIds)))

  const known = new Set(own.map((label) => label.id))
  const alien = labelIds.find((labelId) => !known.has(labelId))
  if (alien) throw new InvalidInputError(`метки ${alien} нет на доске карточки`)
}

/** Правка карточки: приехало поле — меняется, не приехало — остаётся как было. */
export type CardChanges = {
  title?: string
  description?: string | null
  due?: DueInput | null
  done?: boolean
  addLabelIds?: string[]
  removeLabelIds?: string[]
}

/**
 * Заголовок, описание, срок, отметка «выполнено» и метки — одной транзакцией и одним
 * событием на доску. Порознь правка на середине падала бы, оставив карточку в наполовину
 * записанном виде, и рассылала бы во вкладки по перечитыванию доски на каждое поле.
 *
 * Момент срока собирает сервис, а не клиент: иначе у MCP появилась бы вторая реализация
 * сведения с часовым поясом. `due: null` снимает только срок — отметка «выполнено» это
 * свойство карточки, а не её срока, и переживает уборку даты. Имя поля `dueDone` осталось
 * с тех пор, когда отметка жила при сроке.
 */
export async function updateCard(cardId: string, changes: CardChanges): Promise<CardPosition> {
  const patch: {
    title?: string
    description?: string | null
    dueAt?: Date | null
    dueHasTime?: boolean
    dueDone?: boolean
  } = {}

  if (changes.title !== undefined) patch.title = title(changes.title, 'карточка')
  if (changes.description !== undefined) patch.description = cardDescription(changes.description)
  if (changes.due !== undefined) {
    const due = changes.due === null ? null : dueMoment(changes.due)
    patch.dueAt = due?.at ?? null
    patch.dueHasTime = due?.hasTime ?? true
  }
  if (changes.done !== undefined) patch.dueDone = changes.done

  const attached = changes.addLabelIds ?? []
  const detached = changes.removeLabelIds ?? []
  const fields = Object.keys(patch).length > 0
  if (!fields && !attached.length && !detached.length) {
    throw new InvalidInputError('карточка: править нечего')
  }

  const card = await locateCard(cardId)
  if (attached.length) await checkBoardLabels(card.boardId, attached)

  const updated = await db.transaction(async (tx) => {
    const [row] = fields
      ? await tx
          .update(cards)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))
          .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })
      : [card]
    if (!row) throw new NotFoundError(`карточки ${cardId} нет или она в архиве`)

    // повторное навешивание проходит молча: переключатель не должен падать на гонке
    if (attached.length) {
      await tx
        .insert(cardLabels)
        .values(attached.map((labelId) => ({ cardId, labelId })))
        .onConflictDoNothing()
    }
    if (detached.length) {
      await tx
        .delete(cardLabels)
        .where(and(eq(cardLabels.cardId, cardId), inArray(cardLabels.labelId, detached)))
    }

    return { id: row.id, listId: row.listId, rank: row.rank }
  })

  if (patch.title !== undefined) await retitleCardBlocks(cardId, patch.title)

  publishBoardChanged(card.boardId)
  return updated
}

export type CardDue = {
  id: string
  title: string
  dueAt: Date
  dueHasTime: boolean
  dueDone: boolean
  boardId: string
  boardTitle: string
}

/**
 * Сроки живых карточек, попавшие в окно из московских дат (обе границы включительно).
 * Срок — один момент (`due_has_time` только говорит, значимо ли в нём время), поэтому
 * окно берётся моментами, как у событий со временем.
 *
 * Архив не отдаётся ни на одном уровне: срок карточки из архивного списка или архивной
 * доски означал бы на сетке работу, которой уже нет.
 */
export async function listDueCards(from: string, to: string): Promise<CardDue[]> {
  const { start: windowStart, end: windowEnd } = parseDayWindow(from, to)

  const rows = await db
    .select({
      id: cards.id,
      title: cards.title,
      dueAt: cards.dueAt,
      dueHasTime: cards.dueHasTime,
      dueDone: cards.dueDone,
      boardId: boards.id,
      boardTitle: boards.title,
    })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(
      and(
        isNull(cards.archivedAt),
        isNull(lists.archivedAt),
        isNull(boards.archivedAt),
        gte(cards.dueAt, windowStart),
        lt(cards.dueAt, windowEnd),
      ),
    )
    .orderBy(asc(cards.dueAt), asc(cards.title))

  // условие выборки уже отсекло карточки без срока, но в типе колонка остаётся нулевой
  return rows.flatMap((row) => (row.dueAt === null ? [] : [{ ...row, dueAt: row.dueAt }]))
}

export type CardHit = {
  id: string
  title: string
  boardId: string
  boardTitle: string
  listId: string
  listTitle: string
  dueAt: Date | null
  dueHasTime: boolean
  dueDone: boolean
}

export type CardSearch = {
  text?: string
  boardId?: string
  labelId?: string
  dueFrom?: string
  dueTo?: string
  limit?: number
}

const HITS_DEFAULT = 50
const HITS_MAX = 200

/** В `LIKE` проценты и подчёркивания — служебные: искомое «100%» иначе совпадёт со всем. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

/**
 * Поиск карточек по тексту, метке, доске и окну срока. Ищется по заголовку и описанию;
 * архив не отдаётся ни на одном уровне, как и в сроках.
 *
 * Выдача всегда обрезана: без предела ответ на «покажи всё» съел бы контекст целиком.
 * Сначала идут ближайшие сроки, бессрочные — в конце (в Postgres `NULL` при `ASC`
 * ложится последним).
 */
export async function searchCards(filter: CardSearch): Promise<CardHit[]> {
  const where = [isNull(cards.archivedAt), isNull(lists.archivedAt), isNull(boards.archivedAt)]

  const text = filter.text?.trim()
  if (text) {
    const pattern = likePattern(text)
    const found = or(ilike(cards.title, pattern), ilike(cards.description, pattern))
    if (found) where.push(found)
  }

  if (filter.boardId) where.push(eq(boards.id, filter.boardId))

  if (filter.labelId) {
    where.push(
      inArray(
        cards.id,
        db
          .select({ cardId: cardLabels.cardId })
          .from(cardLabels)
          .where(eq(cardLabels.labelId, filter.labelId)),
      ),
    )
  }

  if (filter.dueFrom !== undefined || filter.dueTo !== undefined) {
    const from = filter.dueFrom ?? filter.dueTo
    const to = filter.dueTo ?? filter.dueFrom
    const window = parseDayWindow(from ?? '', to ?? '', 'срока')
    where.push(gte(cards.dueAt, window.start))
    where.push(lt(cards.dueAt, window.end))
  }

  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? HITS_DEFAULT), 1), HITS_MAX)

  return db
    .select({
      id: cards.id,
      title: cards.title,
      boardId: boards.id,
      boardTitle: boards.title,
      listId: cards.listId,
      listTitle: lists.title,
      dueAt: cards.dueAt,
      dueHasTime: cards.dueHasTime,
      dueDone: cards.dueDone,
    })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(and(...where))
    .orderBy(asc(cards.dueAt), asc(cards.title))
    .limit(limit)
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
  const next = await neighbourRank(input.nextCardId, input.listId, 'справа')

  const moved = await moveWithinCollection(
    { prev, next },
    (after) => nextRankInList(input.listId, after),
    async (rank) => {
      const [updated] = await db
        .update(cards)
        .set({ listId: input.listId, rank, updatedAt: new Date() })
        .where(and(eq(cards.id, input.cardId), isNull(cards.archivedAt)))
        .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

      if (!updated) throw new NotFoundError(`карточки ${input.cardId} нет или она в архиве`)
      return updated
    },
  )

  publishBoardChanged(card.boardId)
  return moved
}

/** Перенос в конец списка одним UPDATE под повтором: соседей из меню не выбирают. */
async function moveCardToListEnd(cardId: string, listId: string): Promise<CardPosition> {
  return withRankRetry(async () => {
    const [updated] = await db
      .update(cards)
      .set({ listId, rank: rankAfter(await lastRank(listId)), updatedAt: new Date() })
      .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))
      .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

    if (!updated) throw new NotFoundError(`карточки ${cardId} нет или она в архиве`)
    return updated
  })
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
    const moved = await moveCardToListEnd(input.cardId, input.listId)
    publishBoardChanged(card.boardId)
    return { ...moved, droppedLabels: [] }
  }

  const { droppedLabels, keptLabels } = await previewBoardMove(input.cardId, input.listId)

  const moved = await withRankRetry(() =>
    db.transaction(async (tx) => {
      const [updated] = await tx
        .update(cards)
        .set({
          listId: input.listId,
          rank: rankAfter(await lastRank(input.listId, tx)),
          updatedAt: new Date(),
        })
        .where(eq(cards.id, input.cardId))
        .returning({ id: cards.id, listId: cards.listId, rank: cards.rank })

      await tx.delete(cardLabels).where(eq(cardLabels.cardId, input.cardId))
      if (keptLabels.length) {
        await tx
          .insert(cardLabels)
          .values(keptLabels.map((l) => ({ cardId: input.cardId, labelId: l.id })))
      }

      return { ...updated, droppedLabels }
    }),
  )

  // карточка ушла с одной доски на другую: перечитать надо обе
  publishBoardChanged(card.boardId)
  publishBoardChanged(target.boardId)
  return moved
}

export async function archiveCard(cardId: string): Promise<{ id: string; title: string }> {
  // Google первым: не снялось зеркало — карточка осталась на доске и попытку можно повторить
  await unmirrorCardBlocks([cardId])

  const now = new Date()

  const [archived] = await db
    .update(cards)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))
    .returning({ id: cards.id, title: cards.title })

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
