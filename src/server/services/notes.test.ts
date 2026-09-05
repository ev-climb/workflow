import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/client.ts'
import { checklistItems, checklists, notes } from '../db/schema.ts'
import { createBoard, createList } from './boards.ts'
import { getCard } from './cards.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import {
  addNoteItem,
  archiveNote,
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  deleteNoteItem,
  getNote,
  listFolders,
  listNotes,
  noteToCard,
  restoreNote,
  updateNote,
  updateNoteItem,
} from './notes.ts'

const MISSING = '00000000-0000-0000-0000-000000000000'

async function list(): Promise<string> {
  const board = await createBoard({ title: 'Доска' })
  return (await createList({ boardId: board.id, title: 'Бэклог' })).id
}

describe('заметки', () => {
  it('новая встаёт наверх списка', async () => {
    await createNote({ body: 'первая' })
    await createNote({ body: 'вторая' })

    expect((await listNotes({})).map((note) => note.body)).toEqual(['вторая', 'первая'])
  })

  it('заводится без единого поля', async () => {
    const note = await createNote({})
    expect(note).toMatchObject({ kind: 'text', title: null, body: null, archived: false })
  })

  it('текст у списка дел — ошибка', async () => {
    await expect(createNote({ kind: 'list', body: 'что-то' })).rejects.toThrow(InvalidInputError)
  })

  it('правится по полям, нетронутое остаётся', async () => {
    const note = await createNote({ title: 'Покупки', body: 'молоко' })
    const updated = await updateNote(note.id, { body: 'молоко\nхлеб' })

    expect(updated).toMatchObject({ title: 'Покупки', body: 'молоко\nхлеб' })
  })

  it('пустая правка — ошибка', async () => {
    const note = await createNote({ body: 'текст' })
    await expect(updateNote(note.id, {})).rejects.toThrow(InvalidInputError)
  })

  it('пустой заголовок стирается в null, а не в пустую строку', async () => {
    const note = await createNote({ title: 'Было' })
    expect((await updateNote(note.id, { title: '   ' })).title).toBeNull()
  })
})

describe('архив заметки', () => {
  it('в архив и обратно', async () => {
    const note = await createNote({ body: 'текст' })
    await archiveNote(note.id)

    expect(await listNotes({})).toEqual([])
    expect((await listNotes({ archived: true })).map((one) => one.id)).toEqual([note.id])

    await restoreNote(note.id)
    expect((await listNotes({})).map((one) => one.id)).toEqual([note.id])
  })

  it('дважды в архив не уходит', async () => {
    const note = await createNote({ body: 'текст' })
    await archiveNote(note.id)
    await expect(archiveNote(note.id)).rejects.toThrow(NotFoundError)
  })

  it('живая заметка насовсем не удаляется', async () => {
    const note = await createNote({ body: 'текст' })
    await expect(deleteNote(note.id)).rejects.toThrow(NotFoundError)
  })

  it('из архива удаляется насовсем', async () => {
    const note = await createNote({ body: 'текст' })
    await archiveNote(note.id)
    await deleteNote(note.id)

    await expect(getNote(note.id)).rejects.toThrow(NotFoundError)
  })
})

describe('директории', () => {
  it('считают только живые заметки', async () => {
    const folder = await createFolder({ title: 'Работа' })
    const first = await createNote({ folderId: folder.id, body: 'раз' })
    await createNote({ folderId: folder.id, body: 'два' })
    await archiveNote(first.id)

    expect(await listFolders()).toEqual([{ ...folder, notes: 1 }])
  })

  it('фильтр по директории и по её отсутствию', async () => {
    const folder = await createFolder({ title: 'Работа' })
    await createNote({ folderId: folder.id, body: 'в директории' })
    await createNote({ body: 'сама по себе' })

    expect((await listNotes({ folderId: folder.id })).map((one) => one.body)).toEqual([
      'в директории',
    ])
    expect((await listNotes({ folderId: null })).map((one) => one.body)).toEqual(['сама по себе'])
    expect(await listNotes({})).toHaveLength(2)
  })

  it('заметка переезжает между директориями и наружу', async () => {
    const from = await createFolder({ title: 'Работа' })
    const to = await createFolder({ title: 'Дом' })
    const note = await createNote({ folderId: from.id, body: 'текст' })

    expect((await updateNote(note.id, { folderId: to.id })).folderId).toBe(to.id)
    expect((await updateNote(note.id, { folderId: null })).folderId).toBeNull()
  })

  it('перенос в несуществующую директорию — ошибка', async () => {
    const note = await createNote({ body: 'текст' })
    await expect(updateNote(note.id, { folderId: MISSING })).rejects.toThrow(NotFoundError)
  })

  it('удалённая директория отпускает заметки, а не уносит', async () => {
    const folder = await createFolder({ title: 'Работа' })
    const note = await createNote({ folderId: folder.id, body: 'текст' })
    await deleteFolder(folder.id)

    expect((await getNote(note.id)).folderId).toBeNull()
  })
})

describe('список дел', () => {
  it('пункты идут в порядке добавления и отмечаются', async () => {
    const note = await createNote({ kind: 'list', title: 'Покупки' })
    await addNoteItem({ noteId: note.id, title: 'молоко' })
    const bread = await addNoteItem({ noteId: note.id, title: 'хлеб' })
    await updateNoteItem(bread.id, { done: true })

    const full = await getNote(note.id)
    expect(full.items.map((item) => [item.title, item.done])).toEqual([
      ['молоко', false],
      ['хлеб', true],
    ])

    await deleteNoteItem(bread.id)
    expect((await getNote(note.id)).items).toHaveLength(1)
  })

  it('у текстовой заметки пунктов не бывает', async () => {
    const note = await createNote({ body: 'просто текст' })
    await expect(addNoteItem({ noteId: note.id, title: 'пункт' })).rejects.toThrow(
      InvalidInputError,
    )
  })

  it('удалённая заметка уносит пункты', async () => {
    const note = await createNote({ kind: 'list', title: 'Покупки' })
    await addNoteItem({ noteId: note.id, title: 'молоко' })
    await archiveNote(note.id)
    await deleteNote(note.id)

    expect(await db.select().from(notes).where(eq(notes.id, note.id))).toEqual([])
  })
})

describe('заметка в карточку', () => {
  it('заголовок и описание кладутся как передали', async () => {
    const listId = await list()
    const note = await createNote({ body: 'Позвонить в банк\nуточнить лимит' })

    const card = await noteToCard({
      noteId: note.id,
      listId,
      title: 'Позвонить в банк',
      description: 'уточнить лимит',
    })

    expect(await getCard(card.id)).toMatchObject({
      title: 'Позвонить в банк',
      description: 'уточнить лимит',
    })
  })

  it('пункты списка дел становятся чек-листом с отметками', async () => {
    const listId = await list()
    const note = await createNote({ kind: 'list', title: 'Сборы' })
    await addNoteItem({ noteId: note.id, title: 'паспорт' })
    const ticket = await addNoteItem({ noteId: note.id, title: 'билет' })
    await updateNoteItem(ticket.id, { done: true })

    const card = await noteToCard({ noteId: note.id, listId, title: 'Сборы' })

    const [checklist] = await db.select().from(checklists).where(eq(checklists.cardId, card.id))
    expect(checklist.title).toBe('Сборы')

    const items = await db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, checklist.id))
      .orderBy(checklistItems.rank)
    expect(items.map((item) => [item.title, item.done])).toEqual([
      ['паспорт', false],
      ['билет', true],
    ])
  })

  it('отмеченная заметка уходит в архив, неотмеченная остаётся', async () => {
    const listId = await list()
    const kept = await createNote({ body: 'останется' })
    const gone = await createNote({ body: 'уедет' })

    await noteToCard({ noteId: kept.id, listId, title: 'останется' })
    await noteToCard({ noteId: gone.id, listId, title: 'уедет', archive: true })

    expect((await listNotes({})).map((one) => one.id)).toEqual([kept.id])
    expect((await listNotes({ archived: true })).map((one) => one.id)).toEqual([gone.id])
  })
})
