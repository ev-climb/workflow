import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.ts'
import { checklistItems } from '../db/schema.ts'
import { createBoard, createList, getBoard } from './boards.ts'
import { archiveCard, createCard } from './cards.ts'
import {
  addChecklistItem,
  createChecklist,
  deleteChecklist,
  deleteChecklistItem,
  listChecklists,
  moveChecklistItem,
  renameChecklist,
  updateChecklistItem,
} from './checklists.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'

const MISSING = '00000000-0000-4000-8000-000000000000'

async function card(title = 'карточка') {
  const board = await createBoard({ title: 'Доска' })
  const list = await createList({ boardId: board.id, title: 'Бэклог' })
  const created = await createCard({ listId: list.id, title })
  return { boardId: board.id, cardId: created.id }
}

async function items(checklistId: string, titles: string[]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  for (const title of titles) ids[title] = (await addChecklistItem({ checklistId, title })).id
  return ids
}

async function order(cardId: string, checklistTitle: string): Promise<string[]> {
  const all = await listChecklists(cardId)
  return all.find((c) => c.title === checklistTitle)!.items.map((i) => i.title)
}

async function stamps(): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: checklistItems.id, updatedAt: checklistItems.updatedAt })
    .from(checklistItems)
  return new Map(rows.map((row) => [row.id, row.updatedAt.getTime()]))
}

async function progress(boardId: string): Promise<{ done: number; total: number }> {
  const [found] = (await getBoard(boardId)).lists[0].cards
  return { done: found.checklistDone, total: found.checklistTotal }
}

describe('чек-листы карточки', () => {
  it('несколько на карточку, каждый со своими пунктами и в порядке добавления', async () => {
    const { cardId } = await card()
    const first = await createChecklist({ cardId, title: 'Подготовка' })
    const second = await createChecklist({ cardId, title: 'Проверка' })
    await items(first.id, ['собрать', 'разложить'])
    await items(second.id, ['прогнать тесты'])

    expect(await listChecklists(cardId)).toMatchObject([
      { title: 'Подготовка', items: [{ title: 'собрать' }, { title: 'разложить' }] },
      { title: 'Проверка', items: [{ title: 'прогнать тесты' }] },
    ])
  })

  it('переименовывается, а пустой заголовок не проходит', async () => {
    const { cardId } = await card()
    const list = await createChecklist({ cardId, title: 'Подготовка' })

    expect(await renameChecklist(list.id, ' Сборка ')).toMatchObject({ title: 'Сборка' })
    await expect(renameChecklist(list.id, '   ')).rejects.toBeInstanceOf(InvalidInputError)
    await expect(createChecklist({ cardId, title: '' })).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('удаляется вместе с пунктами', async () => {
    const { cardId } = await card()
    const first = await createChecklist({ cardId, title: 'Подготовка' })
    const second = await createChecklist({ cardId, title: 'Проверка' })
    await items(first.id, ['собрать'])
    await items(second.id, ['прогнать тесты'])

    await deleteChecklist(first.id)

    expect(await listChecklists(cardId)).toMatchObject([{ title: 'Проверка' }])
    expect(await db.select().from(checklistItems)).toHaveLength(1)
  })

  it('карточки нет или она в архиве — чек-лист не заводится', async () => {
    const { cardId } = await card()
    await archiveCard(cardId)

    await expect(createChecklist({ cardId, title: 'Поздно' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(createChecklist({ cardId: MISSING, title: 'Нет' })).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('чек-листа или пункта нет — говорят об этом, а не падают', async () => {
    await expect(renameChecklist(MISSING, 'нет')).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteChecklist(MISSING)).rejects.toBeInstanceOf(NotFoundError)
    await expect(addChecklistItem({ checklistId: MISSING, title: 'нет' })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(updateChecklistItem(MISSING, { done: true })).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteChecklistItem(MISSING)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('пункты чек-листа', () => {
  it('отмечаются и снимаются, заголовок правится', async () => {
    const { cardId } = await card()
    const list = await createChecklist({ cardId, title: 'Подготовка' })
    const ids = await items(list.id, ['собрать'])

    expect(await updateChecklistItem(ids.собрать, { done: true })).toMatchObject({ done: true })
    expect(await updateChecklistItem(ids.собрать, { title: ' сложить ' })).toMatchObject({
      title: 'сложить',
      done: true,
    })
    expect(await updateChecklistItem(ids.собрать, { done: false })).toMatchObject({ done: false })
    await expect(updateChecklistItem(ids.собрать, {})).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('удаляются поштучно', async () => {
    const { cardId } = await card()
    const list = await createChecklist({ cardId, title: 'Подготовка' })
    const ids = await items(list.id, ['собрать', 'разложить'])

    await deleteChecklistItem(ids.собрать)

    expect(await order(cardId, 'Подготовка')).toEqual(['разложить'])
  })
})

describe('перестановка пунктов', () => {
  let cardId: string
  let listId: string
  let ids: Record<string, string>

  beforeEach(async () => {
    ;({ cardId } = await card())
    listId = (await createChecklist({ cardId, title: 'Подготовка' })).id
    ids = await items(listId, ['a', 'b', 'c', 'd'])
  })

  it('в начало, в середину и в конец', async () => {
    await moveChecklistItem({ itemId: ids.d, checklistId: listId, nextItemId: ids.a })
    expect(await order(cardId, 'Подготовка')).toEqual(['d', 'a', 'b', 'c'])

    await moveChecklistItem({
      itemId: ids.d,
      checklistId: listId,
      prevItemId: ids.a,
      nextItemId: ids.b,
    })
    expect(await order(cardId, 'Подготовка')).toEqual(['a', 'd', 'b', 'c'])

    await moveChecklistItem({ itemId: ids.a, checklistId: listId, prevItemId: ids.c })
    expect(await order(cardId, 'Подготовка')).toEqual(['d', 'b', 'c', 'a'])
  })

  it('трогает ровно одну строку: инвариант 1 распространяется и на пункты', async () => {
    const before = await stamps()
    await moveChecklistItem({ itemId: ids.d, checklistId: listId, nextItemId: ids.a })
    const after = await stamps()

    const changed = [...after].filter(([id, at]) => before.get(id) !== at).map(([id]) => id)
    expect(changed).toEqual([ids.d])
  })

  it('переезжает в соседний чек-лист той же карточки', async () => {
    const other = await createChecklist({ cardId, title: 'Проверка' })
    const theirs = await items(other.id, ['x'])

    await moveChecklistItem({ itemId: ids.b, checklistId: other.id, prevItemId: theirs.x })

    expect(await order(cardId, 'Подготовка')).toEqual(['a', 'c', 'd'])
    expect(await order(cardId, 'Проверка')).toEqual(['x', 'b'])
  })

  it('в чужую карточку не переезжает', async () => {
    const other = await card('соседняя')
    const theirs = await createChecklist({ cardId: other.cardId, title: 'Чужой' })

    await expect(
      moveChecklistItem({ itemId: ids.a, checklistId: theirs.id, prevItemId: null }),
    ).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('сосед из другого чек-листа и сосед-сам-себе — ошибка входа', async () => {
    const other = await createChecklist({ cardId, title: 'Проверка' })
    const theirs = await items(other.id, ['x'])

    await expect(
      moveChecklistItem({ itemId: ids.a, checklistId: listId, prevItemId: theirs.x }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    await expect(
      moveChecklistItem({ itemId: ids.a, checklistId: listId, prevItemId: ids.a }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    await expect(
      moveChecklistItem({ itemId: ids.a, checklistId: listId, nextItemId: MISSING }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('прогресс на карточке в колонке', () => {
  it('считается по всем чек-листам карточки', async () => {
    const { boardId, cardId } = await card()
    const first = await createChecklist({ cardId, title: 'Подготовка' })
    const second = await createChecklist({ cardId, title: 'Проверка' })
    const ids = { ...(await items(first.id, ['a', 'b'])), ...(await items(second.id, ['c'])) }

    expect(await progress(boardId)).toEqual({ done: 0, total: 3 })

    await updateChecklistItem(ids.a, { done: true })
    await updateChecklistItem(ids.c, { done: true })
    expect(await progress(boardId)).toEqual({ done: 2, total: 3 })

    await deleteChecklist(second.id)
    expect(await progress(boardId)).toEqual({ done: 1, total: 2 })

    await deleteChecklistItem(ids.b)
    expect(await progress(boardId)).toEqual({ done: 1, total: 1 })
  })
})
