import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../db/client.ts'
import { attachments as attachmentsTable } from '../db/schema.ts'
import { createBoard, createList } from './boards.ts'
import { archiveCard, createCard } from './cards.ts'
import {
  ATTACHMENT_MAX_BYTES,
  addAttachment,
  deleteAttachment,
  listAttachments,
  openAttachment,
} from './attachments.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'

const MISSING = '00000000-0000-4000-8000-000000000000'

const root = await mkdtemp(join(tmpdir(), 'workflow-attachments-'))
process.env.ATTACHMENTS_DIR = root

afterAll(() => rm(root, { recursive: true, force: true }))

async function card(): Promise<string> {
  const board = await createBoard({ title: 'Доска' })
  const list = await createList({ boardId: board.id, title: 'Бэклог' })
  return (await createCard({ listId: list.id, title: 'карточка' })).id
}

const bytes = (text: string) => new TextEncoder().encode(text)

async function readBack(id: string): Promise<string> {
  const file = await openAttachment(id)
  return new TextDecoder().decode(await new Response(file.stream).arrayBuffer())
}

async function storedPath(id: string): Promise<string> {
  const [row] = await db
    .select({ path: attachmentsTable.path })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.id, id))
  return row.path
}

async function filesOnDisk(): Promise<string[]> {
  const found = await readdir(root, { recursive: true, withFileTypes: true })
  return found.filter((entry) => entry.isFile()).map((entry) => entry.name)
}

describe('вложения карточки', () => {
  it('файл кладётся на диск и читается обратно тем же содержимым', async () => {
    const cardId = await card()
    const added = await addAttachment({
      cardId,
      name: 'отчёт.txt',
      mimeType: 'text/plain',
      bytes: bytes('привет'),
    })

    expect(added).toMatchObject({ name: 'отчёт.txt', mimeType: 'text/plain' })
    expect(added.sizeBytes).toBe(bytes('привет').byteLength)
    expect(await readBack(added.id)).toBe('привет')
  })

  it('имя файла сохраняется как есть, а на диск идёт выдуманное', async () => {
    const cardId = await card()
    const added = await addAttachment({ cardId, name: 'Смета 2026.pdf', bytes: bytes('%PDF') })

    expect((await listAttachments(cardId))[0].name).toBe('Смета 2026.pdf')
    expect(await storedPath(added.id)).not.toContain('Смета')
  })

  it('путь в базе относительный и лежит внутри каталога вложений', async () => {
    const cardId = await card()
    const added = await addAttachment({ cardId, name: 'a.txt', bytes: bytes('a') })
    const path = await storedPath(added.id)

    expect(isAbsolute(path)).toBe(false)
    expect(path.startsWith(`${cardId}/`)).toBe(true)
    expect((await stat(join(root, path))).isFile()).toBe(true)
  })

  it('имя с обходом каталога не выводит файл наружу', async () => {
    const cardId = await card()
    const added = await addAttachment({
      cardId,
      name: '../../../взлом.txt',
      bytes: bytes('вредно'),
    })

    const path = await storedPath(added.id)
    expect(path).not.toContain('..')
    expect(resolve(root, path).startsWith(`${root}/`)).toBe(true)
    // имя осталось подписью, но разделители из него убраны
    expect(added.name).toBe('.._.._.._взлом.txt')
  })

  it('без типа содержимого вложение получает octet-stream', async () => {
    const cardId = await card()
    const added = await addAttachment({ cardId, name: 'a.bin', mimeType: '', bytes: bytes('a') })

    expect(added.mimeType).toBe('application/octet-stream')
  })

  it('вложения карточки отдаются в порядке добавления', async () => {
    const cardId = await card()
    for (const name of ['первый.txt', 'второй.txt', 'третий.txt']) {
      await addAttachment({ cardId, name, bytes: bytes(name) })
    }

    expect((await listAttachments(cardId)).map((a) => a.name)).toEqual([
      'первый.txt',
      'второй.txt',
      'третий.txt',
    ])
  })

  it('вложения соседней карточки не подмешиваются', async () => {
    const mine = await card()
    const other = await card()
    await addAttachment({ cardId: mine, name: 'моё.txt', bytes: bytes('м') })
    await addAttachment({ cardId: other, name: 'чужое.txt', bytes: bytes('ч') })

    expect((await listAttachments(mine)).map((a) => a.name)).toEqual(['моё.txt'])
  })

  it('пустой файл и файл сверх предела не доходят до диска', async () => {
    const cardId = await card()
    const before = (await filesOnDisk()).length

    await expect(addAttachment({ cardId, name: 'a.txt', bytes: bytes('') })).rejects.toThrow(
      InvalidInputError,
    )
    await expect(
      addAttachment({ cardId, name: 'a.txt', bytes: new Uint8Array(ATTACHMENT_MAX_BYTES + 1) }),
    ).rejects.toThrow(InvalidInputError)

    expect(await filesOnDisk()).toHaveLength(before)
    expect(await listAttachments(cardId)).toEqual([])
  })

  it('пустое имя — ошибка входа', async () => {
    const cardId = await card()

    await expect(addAttachment({ cardId, name: '   ', bytes: bytes('a') })).rejects.toThrow(
      InvalidInputError,
    )
  })

  it('карточки нет или она в архиве — вложение не заводится', async () => {
    const cardId = await card()
    await archiveCard(cardId)

    await expect(addAttachment({ cardId, name: 'a.txt', bytes: bytes('a') })).rejects.toThrow(
      NotFoundError,
    )
    await expect(
      addAttachment({ cardId: MISSING, name: 'a.txt', bytes: bytes('a') }),
    ).rejects.toThrow(NotFoundError)
  })

  it('удаление уносит и строку, и файл с диска', async () => {
    const cardId = await card()
    const added = await addAttachment({ cardId, name: 'a.txt', bytes: bytes('a') })
    const absolute = join(root, await storedPath(added.id))

    await deleteAttachment(added.id)

    expect(await listAttachments(cardId)).toEqual([])
    await expect(stat(absolute)).rejects.toThrow()
    await expect(openAttachment(added.id)).rejects.toThrow(NotFoundError)
  })

  it('строка без файла на диске читается как отсутствие, а не как пятисотка', async () => {
    const cardId = await card()
    const added = await addAttachment({ cardId, name: 'a.txt', bytes: bytes('a') })
    await rm(join(root, await storedPath(added.id)))

    await expect(openAttachment(added.id)).rejects.toThrow(NotFoundError)
  })

  it('несуществующее вложение — не найдено', async () => {
    await expect(openAttachment(MISSING)).rejects.toThrow(NotFoundError)
    await expect(deleteAttachment(MISSING)).rejects.toThrow(NotFoundError)
  })

  it('незаданный ATTACHMENTS_DIR — внятная ошибка, а не запись мимо каталога', async () => {
    const cardId = await card()
    delete process.env.ATTACHMENTS_DIR

    try {
      await expect(addAttachment({ cardId, name: 'a.txt', bytes: bytes('a') })).rejects.toThrow(
        /ATTACHMENTS_DIR/,
      )
    } finally {
      process.env.ATTACHMENTS_DIR = root
    }
  })
})
