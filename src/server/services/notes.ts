import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { NoteKind } from '../../lib/notes.ts'
import { db } from '../db/client.ts'
import { checklistItems, checklists, noteFolders, noteItems, notes } from '../db/schema.ts'
import { publishBoardChanged } from './board-events.ts'
import { createCard, describeCard, findCardBoard } from './cards.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import { rankAfter, rankBefore, rankSequence, withRankRetry } from './rank.ts'

const TITLE_MAX = 512
const BODY_MAX = 20000

function title(raw: string, what: string): string {
  const value = raw.trim()
  if (!value) throw new InvalidInputError(`${what}: заголовок пустой`)
  if (value.length > TITLE_MAX) {
    throw new InvalidInputError(`${what}: заголовок длиннее ${TITLE_MAX} символов`)
  }
  return value
}

/** Заголовок заметки необязателен: пустая строка и `null` одинаково означают «своего нет». */
function optionalTitle(raw: string | null): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  if (value.length > TITLE_MAX) {
    throw new InvalidInputError(`заметка: заголовок длиннее ${TITLE_MAX} символов`)
  }
  return value
}

function body(raw: string | null): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  if (value.length > BODY_MAX) {
    throw new InvalidInputError(`заметка: текст длиннее ${BODY_MAX} символов`)
  }
  return value
}

export type NoteItemView = { id: string; title: string; done: boolean; rank: string }

export type NoteView = {
  id: string
  folderId: string | null
  kind: NoteKind
  title: string | null
  body: string | null
  rank: string
  archived: boolean
  // правка на экране, а не в базе: шторка читает заметки только через JSON
  updatedAt: string
  items: NoteItemView[]
}

export type FolderView = { id: string; title: string; rank: string; notes: number }

const NOTE_SELECT = {
  id: notes.id,
  folderId: notes.folderId,
  kind: notes.kind,
  title: notes.title,
  body: notes.body,
  rank: notes.rank,
  archivedAt: notes.archivedAt,
  updatedAt: notes.updatedAt,
}

const ITEM_SELECT = {
  id: noteItems.id,
  title: noteItems.title,
  done: noteItems.done,
  rank: noteItems.rank,
}

async function locateNote(noteId: string): Promise<{ id: string; kind: NoteKind }> {
  const [found] = await db
    .select({ id: notes.id, kind: notes.kind })
    .from(notes)
    .where(eq(notes.id, noteId))

  if (!found) throw new NotFoundError(`заметки ${noteId} нет`)
  return found
}

async function locateItem(itemId: string): Promise<{ id: string; noteId: string }> {
  const [found] = await db
    .select({ id: noteItems.id, noteId: noteItems.noteId })
    .from(noteItems)
    .where(eq(noteItems.id, itemId))

  if (!found) throw new NotFoundError(`пункта ${itemId} нет`)
  return found
}

async function lastFolderRank(): Promise<string | null> {
  const [last] = await db
    .select({ rank: noteFolders.rank })
    .from(noteFolders)
    .orderBy(desc(noteFolders.rank))
    .limit(1)

  return last?.rank ?? null
}

async function firstNoteRank(): Promise<string | null> {
  const [first] = await db.select({ rank: notes.rank }).from(notes).orderBy(asc(notes.rank)).limit(1)

  return first?.rank ?? null
}

async function lastItemRank(noteId: string): Promise<string | null> {
  const [last] = await db
    .select({ rank: noteItems.rank })
    .from(noteItems)
    .where(eq(noteItems.noteId, noteId))
    .orderBy(desc(noteItems.rank))
    .limit(1)

  return last?.rank ?? null
}

/** Директории с числом живых заметок: пустую видно и её не жалко удалить. */
export async function listFolders(): Promise<FolderView[]> {
  const rows = await db
    .select({
      id: noteFolders.id,
      title: noteFolders.title,
      rank: noteFolders.rank,
      notes: sql<number>`count(${notes.id})`.mapWith(Number),
    })
    .from(noteFolders)
    .leftJoin(notes, and(eq(notes.folderId, noteFolders.id), isNull(notes.archivedAt)))
    .groupBy(noteFolders.id)
    .orderBy(asc(noteFolders.rank))

  return rows
}

export async function createFolder(input: { title: string }): Promise<FolderView> {
  const name = title(input.title, 'директория')

  const created = await withRankRetry(async () => {
    const [inserted] = await db
      .insert(noteFolders)
      .values({ title: name, rank: rankAfter(await lastFolderRank()) })
      .returning({ id: noteFolders.id, title: noteFolders.title, rank: noteFolders.rank })

    return inserted
  })

  return { ...created, notes: 0 }
}

export async function renameFolder(folderId: string, newTitle: string): Promise<{ id: string }> {
  const name = title(newTitle, 'директория')

  const [updated] = await db
    .update(noteFolders)
    .set({ title: name, updatedAt: new Date() })
    .where(eq(noteFolders.id, folderId))
    .returning({ id: noteFolders.id })

  if (!updated) throw new NotFoundError(`директории ${folderId} нет`)
  return updated
}

/**
 * Директория удаляется совсем: своего архива у неё нет, а заметки она не уносит —
 * `on delete set null` возвращает их в общий список.
 */
export async function deleteFolder(folderId: string): Promise<{ id: string }> {
  const [removed] = await db
    .delete(noteFolders)
    .where(eq(noteFolders.id, folderId))
    .returning({ id: noteFolders.id })

  if (!removed) throw new NotFoundError(`директории ${folderId} нет`)
  return removed
}

type NoteRow = {
  id: string
  folderId: string | null
  kind: NoteKind
  title: string | null
  body: string | null
  rank: string
  archivedAt: Date | null
  updatedAt: Date
}

function toView(row: NoteRow, items: NoteItemView[]): NoteView {
  const { archivedAt, updatedAt, ...rest } = row
  return { ...rest, archived: archivedAt !== null, updatedAt: updatedAt.toISOString(), items }
}

/**
 * Заметки одной директории или все сразу. `folderId` не передан — вся шторка целиком,
 * `null` — только те, что не разложены. Архив спрашивается отдельно: в общем списке ему
 * делать нечего.
 */
export async function listNotes(filter: {
  folderId?: string | null
  archived?: boolean
}): Promise<NoteView[]> {
  const archived = filter.archived === true
  const where = and(
    archived ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt),
    filter.folderId === undefined
      ? undefined
      : filter.folderId === null
        ? isNull(notes.folderId)
        : eq(notes.folderId, filter.folderId),
  )

  const rows = await db.select(NOTE_SELECT).from(notes).where(where).orderBy(asc(notes.rank))
  if (!rows.length) return []

  const items = await db
    .select({ ...ITEM_SELECT, noteId: noteItems.noteId })
    .from(noteItems)
    .innerJoin(notes, eq(noteItems.noteId, notes.id))
    .where(where)
    .orderBy(asc(noteItems.rank))

  const byNote = new Map<string, NoteItemView[]>()
  for (const { noteId, ...item } of items) {
    const bucket = byNote.get(noteId)
    if (bucket) bucket.push(item)
    else byNote.set(noteId, [item])
  }

  return rows.map((row) => toView(row, byNote.get(row.id) ?? []))
}

export async function getNote(noteId: string): Promise<NoteView> {
  const [found] = await db.select(NOTE_SELECT).from(notes).where(eq(notes.id, noteId))
  if (!found) throw new NotFoundError(`заметки ${noteId} нет`)

  const items = await db
    .select(ITEM_SELECT)
    .from(noteItems)
    .where(eq(noteItems.noteId, noteId))
    .orderBy(asc(noteItems.rank))

  return toView(found, items)
}

/**
 * Новая заметка встаёт наверх списка: заметка заводится, чтобы её тут же дописать, и
 * искать её в хвосте незачем. Список дел заводится без текста — у него пункты.
 */
export async function createNote(input: {
  folderId?: string | null
  kind?: NoteKind
  title?: string | null
  body?: string | null
}): Promise<NoteView> {
  const kind = input.kind ?? 'text'
  const text = body(input.body ?? null)
  if (kind === 'list' && text !== null) {
    throw new InvalidInputError('список дел: текста у него нет, только пункты')
  }

  const created = await withRankRetry(async () => {
    const [inserted] = await db
      .insert(notes)
      .values({
        folderId: input.folderId ?? null,
        kind,
        title: optionalTitle(input.title ?? null),
        body: kind === 'list' ? null : text,
        rank: rankBefore(await firstNoteRank()),
      })
      .returning(NOTE_SELECT)

    return inserted
  })

  return toView(created, [])
}

/**
 * Заголовок, текст и директория правятся по отдельности или вместе. `null` у директории —
 * «убрать из директории», а не «не трогать»: не трогать значит не передавать поле.
 */
export async function updateNote(
  noteId: string,
  changes: { title?: string | null; body?: string | null; folderId?: string | null },
): Promise<NoteView> {
  const note = await locateNote(noteId)
  const patch: { title?: string | null; body?: string | null; folderId?: string | null } = {}

  if (changes.title !== undefined) patch.title = optionalTitle(changes.title)
  if (changes.body !== undefined) {
    const text = body(changes.body)
    if (note.kind === 'list' && text !== null) {
      throw new InvalidInputError('список дел: текста у него нет, только пункты')
    }
    patch.body = text
  }
  if (changes.folderId !== undefined) {
    if (changes.folderId !== null) await requireFolder(changes.folderId)
    patch.folderId = changes.folderId
  }

  if (!Object.keys(patch).length) throw new InvalidInputError('заметка: править нечего')

  await db
    .update(notes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(notes.id, noteId))

  return getNote(noteId)
}

async function requireFolder(folderId: string): Promise<void> {
  const [found] = await db
    .select({ id: noteFolders.id })
    .from(noteFolders)
    .where(eq(noteFolders.id, folderId))

  if (!found) throw new NotFoundError(`директории ${folderId} нет`)
}

/** Мягкое удаление, инвариант 5: заметка уходит в архив шторки, а не пропадает. */
export async function archiveNote(noteId: string): Promise<{ id: string }> {
  const [updated] = await db
    .update(notes)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), isNull(notes.archivedAt)))
    .returning({ id: notes.id })

  if (!updated) throw new NotFoundError(`заметки ${noteId} нет или она уже в архиве`)
  return updated
}

export async function restoreNote(noteId: string): Promise<NoteView> {
  const [updated] = await db
    .update(notes)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), isNotNull(notes.archivedAt)))
    .returning({ id: notes.id })

  if (!updated) throw new NotFoundError(`заметки ${noteId} нет или она не в архиве`)
  return getNote(noteId)
}

/**
 * Насовсем — и только из архива. Живая заметка сначала уходит в архив: путь к настоящей
 * потере всегда идёт через него, инвариант 5.
 */
export async function deleteNote(noteId: string): Promise<{ id: string }> {
  const [removed] = await db
    .delete(notes)
    .where(and(eq(notes.id, noteId), isNotNull(notes.archivedAt)))
    .returning({ id: notes.id })

  if (!removed) throw new NotFoundError(`заметки ${noteId} нет или она не в архиве`)
  return removed
}

export async function addNoteItem(input: {
  noteId: string
  title: string
}): Promise<NoteItemView> {
  const name = title(input.title, 'пункт')
  const note = await locateNote(input.noteId)
  if (note.kind !== 'list') throw new InvalidInputError('пункты бывают только у списка дел')

  return withRankRetry(async () => {
    const [inserted] = await db
      .insert(noteItems)
      .values({ noteId: input.noteId, title: name, rank: rankAfter(await lastItemRank(input.noteId)) })
      .returning(ITEM_SELECT)

    return inserted
  })
}

export async function updateNoteItem(
  itemId: string,
  changes: { title?: string; done?: boolean },
): Promise<NoteItemView> {
  const patch: { title?: string; done?: boolean } = {}
  if (changes.title !== undefined) patch.title = title(changes.title, 'пункт')
  if (changes.done !== undefined) patch.done = changes.done
  if (!Object.keys(patch).length) throw new InvalidInputError('пункт: править нечего')

  await locateItem(itemId)

  const [updated] = await db
    .update(noteItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(noteItems.id, itemId))
    .returning(ITEM_SELECT)

  return updated
}

/** Пункт удаляется совсем: он часть заметки, своего архива у него нет. */
export async function deleteNoteItem(itemId: string): Promise<{ id: string }> {
  await locateItem(itemId)

  const [removed] = await db
    .delete(noteItems)
    .where(eq(noteItems.id, itemId))
    .returning({ id: noteItems.id })

  return removed
}

/**
 * Заметка в карточку доски. Пункты списка дел переезжают чек-листом с сохранёнными
 * отметками: вставляются разом, а не по одному через сервис чек-листов — иначе на список
 * из десяти пунктов вышло бы двадцать запросов и столько же событий доски.
 */
export async function noteToCard(input: {
  noteId: string
  listId: string
  title: string
  description?: string | null
  archive?: boolean
}): Promise<{ id: string; listId: string; rank: string }> {
  const note = await getNote(input.noteId)

  const card = await createCard({ listId: input.listId, title: input.title })

  const text = body(input.description ?? null)
  if (text !== null) await describeCard(card.id, text)

  if (note.items.length) {
    const [checklist] = await db
      .insert(checklists)
      .values({
        cardId: card.id,
        title: note.title?.trim() || 'Список',
        rank: rankBefore(null),
      })
      .returning({ id: checklists.id })

    const ranks = rankSequence(note.items.length)
    await db.insert(checklistItems).values(
      note.items.map((item, at) => ({
        checklistId: checklist.id,
        title: item.title,
        done: item.done,
        rank: ranks[at],
      })),
    )

    // прогресс чек-листа виден на карточке в колонке: без этого доска показывала бы
    // карточку без него до следующего перечитывания
    const boardId = await findCardBoard(card.id)
    if (boardId) publishBoardChanged(boardId)
  }

  if (input.archive) await archiveNote(input.noteId)

  return card
}
