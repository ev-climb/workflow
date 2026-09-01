import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { attachments, cards, lists } from '../db/schema.ts'
import { publishBoardChanged } from './board-events.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'

const NAME_MAX = 255
const DEFAULT_MIME = 'application/octet-stream'

/** Верх на один файл. Пользователь один, но описка в выборе файла не должна забивать диск. */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024

export type AttachmentView = { id: string; name: string; sizeBytes: number; mimeType: string }

export type AttachmentFile = AttachmentView & { stream: ReadableStream<Uint8Array> }

const ATTACHMENT_SELECT = {
  id: attachments.id,
  name: attachments.name,
  sizeBytes: attachments.sizeBytes,
  mimeType: attachments.mimeType,
}

/**
 * Каталог берётся из окружения при каждом обращении: абсолютных путей в исходниках нет —
 * инвариант 7, а модуль грузится раньше, чем в некоторых запусках прочитан `.env`.
 */
function attachmentsDir(): string {
  const dir = process.env.ATTACHMENTS_DIR?.trim()
  if (!dir) {
    throw new Error('ATTACHMENTS_DIR не задан: вложения некуда класть, см. .env.example')
  }
  return resolve(dir)
}

/**
 * Имя файла — только подпись: путь на диске из него не собирается. Разделители и
 * невидимые символы всё же убираются — с ними имя ломает заголовок отдачи.
 */
function fileName(raw: string): string {
  const value = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[/\\]/g, '_')
    .trim()

  if (!value) throw new InvalidInputError('вложение: имя файла пустое')
  if (value.length > NAME_MAX) {
    throw new InvalidInputError(`вложение: имя длиннее ${NAME_MAX} символов`)
  }
  return value
}

async function locateCard(cardId: string): Promise<{ id: string; boardId: string }> {
  const [found] = await db
    .select({ id: cards.id, boardId: lists.boardId })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(and(eq(cards.id, cardId), isNull(cards.archivedAt)))

  if (!found) throw new NotFoundError(`карточки ${cardId} нет или она в архиве`)
  return found
}

async function locateAttachment(
  attachmentId: string,
): Promise<AttachmentView & { path: string; boardId: string }> {
  const [found] = await db
    .select({ ...ATTACHMENT_SELECT, path: attachments.path, boardId: lists.boardId })
    .from(attachments)
    .innerJoin(cards, eq(attachments.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .where(eq(attachments.id, attachmentId))

  if (!found) throw new NotFoundError(`вложения ${attachmentId} нет`)
  return found
}

/** Вложения карточки в порядке добавления. В доске от них ничего не показывается. */
export async function listAttachments(cardId: string): Promise<AttachmentView[]> {
  return db
    .select(ATTACHMENT_SELECT)
    .from(attachments)
    .where(eq(attachments.cardId, cardId))
    .orderBy(asc(attachments.createdAt), asc(attachments.id))
}

/** Кладёт файл в `ATTACHMENTS_DIR` и заводит строку. Имя файла сохраняется как есть. */
export async function addAttachment(input: {
  cardId: string
  name: string
  mimeType?: string | null
  bytes: Uint8Array
}): Promise<AttachmentView> {
  const root = attachmentsDir()
  const name = fileName(input.name)

  if (!input.bytes.byteLength) throw new InvalidInputError('вложение: файл пустой')
  if (input.bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new InvalidInputError(`вложение: файл больше ${ATTACHMENT_MAX_BYTES} байт`)
  }

  const card = await locateCard(input.cardId)

  // имя на диске выдумывает сервис: из пользовательского имени путь не собирается,
  // и выйти из каталога вложений нечем
  const relative = `${input.cardId}/${randomUUID()}`
  const absolute = join(root, relative)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, input.bytes)

  try {
    const [created] = await db
      .insert(attachments)
      .values({
        cardId: input.cardId,
        name,
        path: relative,
        sizeBytes: input.bytes.byteLength,
        mimeType: input.mimeType?.trim() || DEFAULT_MIME,
      })
      .returning(ATTACHMENT_SELECT)

    publishBoardChanged(card.boardId)
    return created
  } catch (error) {
    await rm(absolute, { force: true })
    throw error
  }
}

/**
 * Содержимое вложения. Отдаёт его route handler под сессией: в публичной папке файлы
 * не лежат, иначе знающий имя скачает их без входа.
 */
export async function openAttachment(attachmentId: string): Promise<AttachmentFile> {
  const found = await locateAttachment(attachmentId)
  const absolute = join(attachmentsDir(), found.path)

  const info = await stat(absolute).catch(() => null)
  if (!info?.isFile()) throw new NotFoundError(`файла вложения ${attachmentId} нет на диске`)

  return {
    id: found.id,
    name: found.name,
    mimeType: found.mimeType,
    // длина берётся с диска, а не из базы: заголовок отдачи обязан сойтись с байтами
    sizeBytes: info.size,
    stream: Readable.toWeb(createReadStream(absolute)) as ReadableStream<Uint8Array>,
  }
}

/**
 * Вложение уходит совсем: своего `archived_at` у него нет — инвариант 5 про содержимое
 * доски. Строка удаляется первой: осиротевший файл переживается, строка на стёртый файл —
 * нет.
 */
export async function deleteAttachment(attachmentId: string): Promise<{ id: string }> {
  const found = await locateAttachment(attachmentId)

  const [removed] = await db
    .delete(attachments)
    .where(eq(attachments.id, attachmentId))
    .returning({ id: attachments.id })

  await rm(join(attachmentsDir(), found.path), { force: true })
  publishBoardChanged(found.boardId)
  return removed
}
