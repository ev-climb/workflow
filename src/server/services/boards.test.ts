import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/client.ts'
import {
  boards as boardsTable,
  cardLabels,
  cards,
  checklistItems,
  checklists,
  labels,
} from '../db/schema.ts'
import {
  archiveList,
  createBoard,
  createList,
  getArchive,
  getBoard,
  listBoards,
  restoreList,
} from './boards.ts'
import { archiveCard, createCard } from './cards.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'

describe('чтение доски', () => {
  it('доска без единого списка читается, а не падает', async () => {
    const board = await createBoard({ title: 'Пустая' })
    const full = await getBoard(board.id)

    expect(full.lists).toEqual([])
    expect(full.labels).toEqual([])
  })

  it('списки и карточки идут по рангам, архив скрыт', async () => {
    const board = await createBoard({ title: 'Доска' })
    const backlog = await createList({ boardId: board.id, title: 'Бэклог' })
    const done = await createList({ boardId: board.id, title: 'Готово' })

    const first = await createCard({ listId: backlog.id, title: 'первая' })
    await createCard({ listId: backlog.id, title: 'вторая' })
    await archiveCard(first.id)

    const full = await getBoard(board.id)
    expect(full.lists.map((l) => l.title)).toEqual(['Бэклог', 'Готово'])
    expect(full.lists[0].cards.map((c) => c.title)).toEqual(['вторая'])

    await archiveList(done.id)
    expect((await getBoard(board.id)).lists.map((l) => l.title)).toEqual(['Бэклог'])
  })

  it('значки карточки: метки, описание, прогресс чек-листа, срок', async () => {
    const board = await createBoard({ title: 'Доска' })
    const list = await createList({ boardId: board.id, title: 'Бэклог' })
    const card = await createCard({ listId: list.id, title: 'с начинкой' })
    const plain = await createCard({ listId: list.id, title: 'пустая' })

    const due = new Date('2026-09-01T09:00:00.000Z')
    await db
      .update(cards)
      .set({ description: '**важное**', dueAt: due, dueDone: true })
      .where(eq(cards.id, card.id))

    const [red] = await db
      .insert(labels)
      .values({ boardId: board.id, name: 'срочно', color: 'red' })
      .returning({ id: labels.id })
    await db.insert(cardLabels).values({ cardId: card.id, labelId: red.id })

    const [checklist] = await db
      .insert(checklists)
      .values({ cardId: card.id, title: 'шаги', rank: 'a0' })
      .returning({ id: checklists.id })
    await db.insert(checklistItems).values([
      { checklistId: checklist.id, title: 'раз', done: true, rank: 'a0' },
      { checklistId: checklist.id, title: 'два', done: false, rank: 'a1' },
      { checklistId: checklist.id, title: 'три', done: false, rank: 'a2' },
    ])

    const [filled, empty] = (await getBoard(board.id)).lists[0].cards

    expect(filled.hasDescription).toBe(true)
    expect(filled.checklistDone).toBe(1)
    expect(filled.checklistTotal).toBe(3)
    expect(filled.dueAt?.toISOString()).toBe(due.toISOString())
    expect(filled.dueDone).toBe(true)
    expect(filled.labels.map((l) => l.color)).toEqual(['red'])

    expect(empty.id).toBe(plain.id)
    expect(empty.hasDescription).toBe(false)
    expect(empty.checklistTotal).toBe(0)
    expect(empty.labels).toEqual([])
  })

  it('заархивированной доски нет ни в списке, ни в чтении', async () => {
    const board = await createBoard({ title: 'Доска' })
    await db
      .update(boardsTable)
      .set({ archivedAt: new Date() })
      .where(eq(boardsTable.id, board.id))

    expect(await listBoards()).toEqual([])
    await expect(getBoard(board.id)).rejects.toThrow(NotFoundError)
  })
})

describe('списки', () => {
  it('лимит меньше единицы не принимается', async () => {
    const board = await createBoard({ title: 'Доска' })
    await expect(
      createList({ boardId: board.id, title: 'Сейчас', wipLimit: 0 }),
    ).rejects.toThrow(InvalidInputError)
  })

  it('лимит доезжает до чтения доски', async () => {
    const board = await createBoard({ title: 'Доска' })
    await createList({ boardId: board.id, title: 'Сейчас', wipLimit: 3 })

    expect((await getBoard(board.id)).lists[0].wipLimit).toBe(3)
  })

  it('восстановление возвращает список в конец доски', async () => {
    const board = await createBoard({ title: 'Доска' })
    const first = await createList({ boardId: board.id, title: 'Первый' })
    await createList({ boardId: board.id, title: 'Второй' })

    await archiveList(first.id)
    await restoreList(first.id)

    expect((await getBoard(board.id)).lists.map((l) => l.title)).toEqual(['Второй', 'Первый'])
  })

  it('повторное восстановление — ошибка', async () => {
    const board = await createBoard({ title: 'Доска' })
    const list = await createList({ boardId: board.id, title: 'Список' })
    await expect(restoreList(list.id)).rejects.toThrow(NotFoundError)
  })
})

describe('архив', () => {
  it('показывает, что и откуда уехало', async () => {
    const board = await createBoard({ title: 'Доска' })
    const list = await createList({ boardId: board.id, title: 'Бэклог' })
    const spare = await createList({ boardId: board.id, title: 'Запасной' })
    const card = await createCard({ listId: list.id, title: 'карточка' })

    await archiveCard(card.id)
    await archiveList(spare.id)

    const archive = await getArchive(board.id)
    expect(archive.cards.map((c) => [c.title, c.listTitle])).toEqual([['карточка', 'Бэклог']])
    expect(archive.lists.map((l) => l.title)).toEqual(['Запасной'])
  })

  it('у чистой доски пуст', async () => {
    const board = await createBoard({ title: 'Доска' })
    expect(await getArchive(board.id)).toEqual({ lists: [], cards: [] })
  })
})
