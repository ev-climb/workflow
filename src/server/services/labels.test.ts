import { describe, expect, it } from 'vitest'
import { db } from '../db/client.ts'
import { cardLabels } from '../db/schema.ts'
import { createBoard, createList, getBoard } from './boards.ts'
import { archiveCard, createCard, getCard } from './cards.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import {
  attachLabel,
  createLabel,
  deleteLabel,
  detachLabel,
  listLabels,
  updateLabel,
} from './labels.ts'

async function boardWithCard() {
  const board = await createBoard({ title: 'Доска' })
  const list = await createList({ boardId: board.id, title: 'Бэклог' })
  const card = await createCard({ listId: list.id, title: 'карточка' })
  return { boardId: board.id, cardId: card.id }
}

describe('набор меток доски', () => {
  it('метка заводится и попадает в набор доски', async () => {
    const board = await createBoard({ title: 'Доска' })
    const label = await createLabel({ boardId: board.id, name: 'срочно', color: 'red' })

    expect(label).toMatchObject({ name: 'срочно', color: 'red' })
    expect(await listLabels(board.id)).toEqual([label])
    expect((await getBoard(board.id)).labels).toEqual([label])
  })

  it('метка бывает без названия, только цветом — так приезжает из Trello', async () => {
    const board = await createBoard({ title: 'Доска' })
    const label = await createLabel({ boardId: board.id, name: '   ', color: 'blue' })

    expect(label.name).toBe('')
  })

  it('название и цвет правятся вместе и порознь', async () => {
    const board = await createBoard({ title: 'Доска' })
    const label = await createLabel({ boardId: board.id, name: 'срочно', color: 'red' })

    expect(await updateLabel(label.id, { name: 'важно' })).toMatchObject({
      name: 'важно',
      color: 'red',
    })
    expect(await updateLabel(label.id, { color: 'orange' })).toMatchObject({
      name: 'важно',
      color: 'orange',
    })
    expect(await updateLabel(label.id, { name: 'потом', color: 'sky' })).toMatchObject({
      name: 'потом',
      color: 'sky',
    })
  })

  it('цвет вне набора и пустая правка не проходят', async () => {
    const board = await createBoard({ title: 'Доска' })
    const label = await createLabel({ boardId: board.id, name: 'срочно', color: 'red' })

    await expect(
      createLabel({ boardId: board.id, name: 'какая-то', color: 'ультрамарин' }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    // варианты Trello сводятся к основному цвету только при отрисовке, выбрать их нельзя
    await expect(updateLabel(label.id, { color: 'red_dark' })).rejects.toBeInstanceOf(
      InvalidInputError,
    )
    await expect(updateLabel(label.id, {})).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('пара «название и цвет» на доске не повторяется, а на соседней — пожалуйста', async () => {
    const board = await createBoard({ title: 'Доска' })
    const other = await createBoard({ title: 'Соседняя' })
    await createLabel({ boardId: board.id, name: 'срочно', color: 'red' })

    await expect(
      createLabel({ boardId: board.id, name: 'срочно', color: 'red' }),
    ).rejects.toBeInstanceOf(InvalidInputError)

    const sameOnOther = await createLabel({ boardId: other.id, name: 'срочно', color: 'red' })
    expect(sameOnOther.name).toBe('срочно')

    const green = await createLabel({ boardId: board.id, name: 'срочно', color: 'green' })
    await expect(updateLabel(green.id, { color: 'red' })).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('метки нет — правка и удаление говорят об этом, а не падают', async () => {
    const missing = '00000000-0000-4000-8000-000000000000'

    await expect(updateLabel(missing, { name: 'нет' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteLabel(missing)).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      createLabel({ boardId: missing, name: 'нет', color: 'red' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('удалённая метка исчезает со всех карточек доски', async () => {
    const { boardId, cardId } = await boardWithCard()
    const red = await createLabel({ boardId, name: 'срочно', color: 'red' })
    const blue = await createLabel({ boardId, name: 'потом', color: 'blue' })
    await db.insert(cardLabels).values([
      { cardId, labelId: red.id },
      { cardId, labelId: blue.id },
    ])

    await deleteLabel(red.id)

    expect(await listLabels(boardId)).toEqual([blue])
    const [card] = (await getBoard(boardId)).lists[0].cards
    expect(card.labels).toEqual([blue])
    expect(await db.select().from(cardLabels)).toHaveLength(1)
  })
})

describe('метки на карточке', () => {
  it('метка вешается, снимается и видна и в карточке, и в доске', async () => {
    const { boardId, cardId } = await boardWithCard()
    const label = await createLabel({ boardId, name: 'срочно', color: 'red' })

    await attachLabel(cardId, label.id)
    expect((await getCard(cardId)).labels).toEqual([label])
    expect((await getBoard(boardId)).lists[0].cards[0].labels).toEqual([label])

    await detachLabel(cardId, label.id)
    expect((await getCard(cardId)).labels).toEqual([])
    expect((await getBoard(boardId)).lists[0].cards[0].labels).toEqual([])
  })

  it('повторное навешивание и снятие снятой не ломают переключатель', async () => {
    const { boardId, cardId } = await boardWithCard()
    const label = await createLabel({ boardId, name: 'срочно', color: 'red' })

    await attachLabel(cardId, label.id)
    await attachLabel(cardId, label.id)
    expect(await db.select().from(cardLabels)).toHaveLength(1)

    await detachLabel(cardId, label.id)
    await detachLabel(cardId, label.id)
    expect(await db.select().from(cardLabels)).toHaveLength(0)
  })

  it('метка соседней доски на карточку не вешается', async () => {
    const { cardId } = await boardWithCard()
    const other = await createBoard({ title: 'Соседняя' })
    const alien = await createLabel({ boardId: other.id, name: 'чужая', color: 'blue' })

    await expect(attachLabel(cardId, alien.id)).rejects.toBeInstanceOf(InvalidInputError)
    expect(await db.select().from(cardLabels)).toHaveLength(0)
  })

  it('карточки нет или она в архиве — переключатель говорит об этом', async () => {
    const { boardId, cardId } = await boardWithCard()
    const label = await createLabel({ boardId, name: 'срочно', color: 'red' })
    const missing = '00000000-0000-4000-8000-000000000000'

    await expect(attachLabel(missing, label.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(attachLabel(cardId, missing)).rejects.toBeInstanceOf(NotFoundError)

    await archiveCard(cardId)
    await expect(attachLabel(cardId, label.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(detachLabel(cardId, label.id)).rejects.toBeInstanceOf(NotFoundError)
  })
})
