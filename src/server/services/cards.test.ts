import { and, eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.ts'
import { cardLabels, cards, labels } from '../db/schema.ts'
import { createBoard, createList, getBoard } from './boards.ts'
import {
  archiveCard,
  createCard,
  describeCard,
  findCardBoard,
  getCard,
  moveCard,
  moveCardToBoard,
  previewBoardMove,
  restoreCard,
  setCardDue,
  setCardDueDone,
} from './cards.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import { rankBetween } from './rank.ts'

type Fixture = Awaited<ReturnType<typeof board>>

async function board(title: string, listTitles: string[]) {
  const created = await createBoard({ title })
  const lists: Record<string, string> = {}
  for (const listTitle of listTitles) {
    lists[listTitle] = (await createList({ boardId: created.id, title: listTitle })).id
  }
  return { id: created.id, lists }
}

async function fill(listId: string, titles: string[]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  for (const title of titles) ids[title] = (await createCard({ listId, title })).id
  return ids
}

async function order(fixture: Fixture, listTitle: string): Promise<string[]> {
  const full = await getBoard(fixture.id)
  return full.lists.find((l) => l.title === listTitle)!.cards.map((c) => c.title)
}

/**
 * Сколько строк таблицы реально обновилось. Считаем построчным триггером, а не счётчиком
 * `pg_stat_user_tables`: тот обновляется с задержкой и сразу после операции отдаёт ноль.
 * Считать надо именно строки — инвариант 1 про них, и перенумерация колонки одним
 * запросом нарушила бы его ровно так же, как десять запросов.
 */
async function updatedRows(table: string, run: () => Promise<unknown>): Promise<number> {
  await db.execute(sql.raw('create table if not exists _row_audit (n int)'))
  await db.execute(sql.raw('truncate _row_audit'))
  await db.execute(
    sql.raw(`create or replace function _row_audit_fn() returns trigger language plpgsql as $$
             begin insert into _row_audit values (1); return null; end $$`),
  )
  await db.execute(
    sql.raw(
      `create trigger _row_audit_trg after update on "${table}" for each row execute function _row_audit_fn()`,
    ),
  )

  try {
    await run()
  } finally {
    await db.execute(sql.raw(`drop trigger _row_audit_trg on "${table}"`))
  }

  const rows = await db.execute<{ n: number }>(sql.raw('select count(*)::int as n from _row_audit'))
  return Number(rows[0].n)
}

describe('создание карточки', () => {
  it('встаёт в конец списка', async () => {
    const b = await board('Доска', ['Бэклог'])
    await fill(b.lists['Бэклог'], ['первая', 'вторая', 'третья'])
    expect(await order(b, 'Бэклог')).toEqual(['первая', 'вторая', 'третья'])
  })

  it('в несуществующем списке — ошибка', async () => {
    await expect(
      createCard({ listId: '00000000-0000-0000-0000-000000000000', title: 'x' }),
    ).rejects.toThrow(NotFoundError)
  })

  it('пустой заголовок — ошибка', async () => {
    const b = await board('Доска', ['Бэклог'])
    await expect(createCard({ listId: b.lists['Бэклог'], title: '   ' })).rejects.toThrow(
      InvalidInputError,
    )
  })
})

describe('перемещение внутри списка', () => {
  let b: Fixture
  let ids: Record<string, string>

  beforeEach(async () => {
    b = await board('Доска', ['Бэклог'])
    ids = await fill(b.lists['Бэклог'], ['a', 'b', 'c', 'd'])
  })

  it('в начало', async () => {
    await moveCard({ cardId: ids.d, listId: b.lists['Бэклог'], nextCardId: ids.a })
    expect(await order(b, 'Бэклог')).toEqual(['d', 'a', 'b', 'c'])
  })

  it('в середину', async () => {
    await moveCard({
      cardId: ids.a,
      listId: b.lists['Бэклог'],
      prevCardId: ids.b,
      nextCardId: ids.c,
    })
    expect(await order(b, 'Бэклог')).toEqual(['b', 'a', 'c', 'd'])
  })

  it('в конец', async () => {
    await moveCard({ cardId: ids.a, listId: b.lists['Бэклог'], prevCardId: ids.d })
    expect(await order(b, 'Бэклог')).toEqual(['b', 'c', 'd', 'a'])
  })

  it('трогает ровно одну строку', async () => {
    const touched = await updatedRows('cards', () =>
      moveCard({
        cardId: ids.a,
        listId: b.lists['Бэклог'],
        prevCardId: ids.c,
        nextCardId: ids.d,
      }),
    )
    expect(touched).toBe(1)
  })

  it('соседом самой себе быть не может', async () => {
    await expect(
      moveCard({ cardId: ids.a, listId: b.lists['Бэклог'], prevCardId: ids.a }),
    ).rejects.toThrow(InvalidInputError)
  })

  it('сосед из чужого списка — ошибка входа', async () => {
    const other = await createList({ boardId: b.id, title: 'Готово' })
    const stranger = await createCard({ listId: other.id, title: 'чужая' })
    await expect(
      moveCard({ cardId: ids.a, listId: b.lists['Бэклог'], prevCardId: stranger.id }),
    ).rejects.toThrow(InvalidInputError)
  })

  it('архивная карточка не мешает встать на её место', async () => {
    // ранг архивной остаётся занятым: место между b и d — ровно её
    await archiveCard(ids.c)
    await moveCard({
      cardId: ids.a,
      listId: b.lists['Бэклог'],
      prevCardId: ids.b,
      nextCardId: ids.d,
    })

    expect(await order(b, 'Бэклог')).toEqual(['b', 'a', 'd'])
  })

  it('архивная карточка не двигается', async () => {
    await archiveCard(ids.a)
    await expect(moveCard({ cardId: ids.a, listId: b.lists['Бэклог'] })).rejects.toThrow(
      NotFoundError,
    )
  })
})

describe('перемещение между списками одной доски', () => {
  it('карточка уходит в другой список на нужное место', async () => {
    const b = await board('Доска', ['Бэклог', 'Ревью'])
    const backlog = await fill(b.lists['Бэклог'], ['a', 'b'])
    const review = await fill(b.lists['Ревью'], ['x', 'y'])

    await moveCard({
      cardId: backlog.a,
      listId: b.lists['Ревью'],
      prevCardId: review.x,
      nextCardId: review.y,
    })

    expect(await order(b, 'Бэклог')).toEqual(['b'])
    expect(await order(b, 'Ревью')).toEqual(['x', 'a', 'y'])
  })

  it('в пустой список', async () => {
    const b = await board('Доска', ['Бэклог', 'Готово'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await moveCard({ cardId: ids.a, listId: b.lists['Готово'] })
    expect(await order(b, 'Готово')).toEqual(['a'])
  })
})

describe('перемещение на чужую доску', () => {
  it('перетаскиванием запрещено и объяснено', async () => {
    const from = await board('Откуда', ['Бэклог'])
    const to = await board('Куда', ['Бэклог'])
    const ids = await fill(from.lists['Бэклог'], ['a'])

    await expect(moveCard({ cardId: ids.a, listId: to.lists['Бэклог'] })).rejects.toThrow(
      /ADR-005/,
    )
  })
})

describe('коллизия ранга', () => {
  it('занятый ранг перегенерируется, порядок остаётся верным', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a', 'b', 'c', 'd'])

    const rankOf = async (id: string) => {
      const [row] = await db.select({ rank: cards.rank }).from(cards).where(eq(cards.id, id))
      return row.rank
    }

    // ранг, который moveCard попробует занять первым, уже занят посторонней карточкой
    const squatted = rankBetween(await rankOf(ids.a), await rankOf(ids.b))
    await db
      .insert(cards)
      .values({ listId: b.lists['Бэклог'], title: 'занял место', rank: squatted })

    await moveCard({
      cardId: ids.d,
      listId: b.lists['Бэклог'],
      prevCardId: ids.a,
      nextCardId: ids.b,
    })

    const titles = await order(b, 'Бэклог')
    expect(titles).toEqual(['a', 'd', 'занял место', 'b', 'c'])
    expect(new Set(titles).size).toBe(titles.length)
  })
})

describe('чтение карточки целиком', () => {
  it('отдаёт описание, срок, метки и место карточки', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['карточка'])

    const due = new Date('2026-09-10T09:00:00Z')
    await db
      .update(cards)
      .set({ description: 'что сделать', dueAt: due, dueDone: true })
      .where(eq(cards.id, ids.карточка))

    const [срочно, личное] = await db
      .insert(labels)
      .values([
        { boardId: b.id, name: 'срочно', color: 'red' },
        { boardId: b.id, name: 'личное', color: 'blue' },
      ])
      .returning({ id: labels.id })
    await db.insert(cardLabels).values([
      { cardId: ids.карточка, labelId: срочно.id },
      { cardId: ids.карточка, labelId: личное.id },
    ])

    const card = await getCard(ids.карточка)

    expect(card).toMatchObject({
      id: ids.карточка,
      title: 'карточка',
      description: 'что сделать',
      dueDone: true,
      boardId: b.id,
      boardTitle: 'Доска',
      listId: b.lists['Бэклог'],
      listTitle: 'Бэклог',
    })
    expect(card.dueAt?.toISOString()).toBe(due.toISOString())
    expect(card.labels.map((l) => l.name)).toEqual(['личное', 'срочно'])
  })

  it('пустая карточка отдаётся без описания, срока и меток', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['голая'])

    const card = await getCard(ids.голая)

    expect(card.description).toBeNull()
    expect(card.dueAt).toBeNull()
    expect(card.labels).toEqual([])
  })

  it('чужие метки не приезжают', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['своя', 'чужая'])
    const [метка] = await db
      .insert(labels)
      .values({ boardId: b.id, name: 'метка', color: 'green' })
      .returning({ id: labels.id })
    await db.insert(cardLabels).values({ cardId: ids.чужая, labelId: метка.id })

    expect((await getCard(ids.своя)).labels).toEqual([])
  })

  it('архивная карточка не читается', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await archiveCard(ids.a)

    await expect(getCard(ids.a)).rejects.toThrow(NotFoundError)
  })

  it('несуществующей карточки нет', async () => {
    await expect(getCard('00000000-0000-0000-0000-000000000000')).rejects.toThrow(NotFoundError)
  })
})

describe('описание карточки', () => {
  it('сохраняется и переживает перечитывание', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])

    await describeCard(ids.a, '# План\n\n- раз\n- два')

    expect((await getCard(ids.a)).description).toBe('# План\n\n- раз\n- два')
  })

  it('пустой текст стирает описание в null, а не в пустую строку', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await describeCard(ids.a, 'было')

    await describeCard(ids.a, '   ')

    expect((await getCard(ids.a)).description).toBeNull()
  })

  it('null стирает описание', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await describeCard(ids.a, 'было')

    await describeCard(ids.a, null)

    expect((await getCard(ids.a)).description).toBeNull()
  })

  it('гасит значок описания в доске, когда описание стёрли', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])

    await describeCard(ids.a, 'текст')
    expect((await getBoard(b.id)).lists[0].cards[0].hasDescription).toBe(true)

    await describeCard(ids.a, '')
    expect((await getBoard(b.id)).lists[0].cards[0].hasDescription).toBe(false)
  })

  it('слишком длинное описание — ошибка входа', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])

    await expect(describeCard(ids.a, 'я'.repeat(16_385))).rejects.toThrow(InvalidInputError)
  })

  it('архивной карточке описание не правится', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await archiveCard(ids.a)

    await expect(describeCard(ids.a, 'текст')).rejects.toThrow(NotFoundError)
  })
})

describe('срок карточки', () => {
  it('дата без времени ложится на московскую полночь этого дня', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])

    await setCardDue(ids.a, { date: '2026-10-01' })

    const card = await getCard(ids.a)
    expect(card.dueAt?.toISOString()).toBe('2026-09-30T21:00:00.000Z')
    expect(card.dueHasTime).toBe(false)
  })

  it('дата со временем читается как московская', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])

    await setCardDue(ids.a, { date: '2026-10-01', time: '14:30' })

    const card = await getCard(ids.a)
    expect(card.dueAt?.toISOString()).toBe('2026-10-01T11:30:00.000Z')
    expect(card.dueHasTime).toBe(true)
  })

  it('несуществующая дата и кривое время — ошибка входа', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])

    await expect(setCardDue(ids.a, { date: '2026-02-31' })).rejects.toThrow(InvalidInputError)
    await expect(setCardDue(ids.a, { date: '01.10.2026' })).rejects.toThrow(InvalidInputError)
    await expect(setCardDue(ids.a, { date: '2026-10-01', time: '25:70' })).rejects.toThrow(
      InvalidInputError,
    )
  })

  it('снятый срок снимает и отметку «выполнено»', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await setCardDue(ids.a, { date: '2026-10-01' })
    await setCardDueDone(ids.a, true)

    await setCardDue(ids.a, null)

    const card = await getCard(ids.a)
    expect(card.dueAt).toBeNull()
    expect(card.dueDone).toBe(false)
  })

  it('отмечать нечего, пока срока нет', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])

    await expect(setCardDueDone(ids.a, true)).rejects.toThrow(InvalidInputError)
  })

  it('доска отдаёт срок карточки вместе с признаком времени', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await setCardDue(ids.a, { date: '2026-10-01' })

    const full = await getBoard(b.id)
    const card = full.lists[0].cards.find((c) => c.id === ids.a)!
    expect(card.dueAt?.toISOString()).toBe('2026-09-30T21:00:00.000Z')
    expect(card.dueHasTime).toBe(false)
  })
})

describe('перенос на другую доску через меню', () => {
  async function twoBoards() {
    const from = await board('Откуда', ['Бэклог'])
    const to = await board('Куда', ['Входящие'])

    const [срочно, личное, срочноТам] = await db
      .insert(labels)
      .values([
        { boardId: from.id, name: 'срочно', color: 'red' },
        { boardId: from.id, name: 'личное', color: 'blue' },
        { boardId: to.id, name: 'срочно', color: 'red' },
      ])
      .returning({ id: labels.id })

    const ids = await fill(from.lists['Бэклог'], ['карточка'])
    await db.insert(cardLabels).values([
      { cardId: ids.карточка, labelId: срочно.id },
      { cardId: ids.карточка, labelId: личное.id },
    ])

    return { from, to, cardId: ids.карточка, twinId: срочноТам.id }
  }

  it('предупреждает, какие метки снимутся', async () => {
    const { to, cardId } = await twoBoards()
    const preview = await previewBoardMove(cardId, to.lists['Входящие'])

    expect(preview.droppedLabels.map((l) => l.name)).toEqual(['личное'])
    expect(preview.keptLabels.map((l) => l.name)).toEqual(['срочно'])
  })

  it('снимает чужие метки, а одноимённую переводит на метку доски-приёмника', async () => {
    const { to, cardId, twinId } = await twoBoards()
    const moved = await moveCardToBoard({ cardId, listId: to.lists['Входящие'] })

    expect(moved.droppedLabels.map((l) => l.name)).toEqual(['личное'])

    const left = await db
      .select({ labelId: cardLabels.labelId })
      .from(cardLabels)
      .where(eq(cardLabels.cardId, cardId))

    expect(left.map((l) => l.labelId)).toEqual([twinId])
    expect(await order(to, 'Входящие')).toEqual(['карточка'])
  })

  it('внутри своей доски меток не трогает', async () => {
    const b = await board('Доска', ['Бэклог', 'Готово'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    const [label] = await db
      .insert(labels)
      .values({ boardId: b.id, name: 'метка', color: 'green' })
      .returning({ id: labels.id })
    await db.insert(cardLabels).values({ cardId: ids.a, labelId: label.id })

    const moved = await moveCardToBoard({ cardId: ids.a, listId: b.lists['Готово'] })

    expect(moved.droppedLabels).toEqual([])
    const left = await db
      .select({ labelId: cardLabels.labelId })
      .from(cardLabels)
      .where(eq(cardLabels.cardId, ids.a))
    expect(left).toHaveLength(1)
  })
})

describe('архив карточки', () => {
  it('уходит из списка и возвращается в его конец', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a', 'b', 'c'])

    await archiveCard(ids.a)
    expect(await order(b, 'Бэклог')).toEqual(['b', 'c'])

    await restoreCard(ids.a)
    expect(await order(b, 'Бэклог')).toEqual(['b', 'c', 'a'])
  })

  it('повторная архивация — ошибка', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await archiveCard(ids.a)
    await expect(archiveCard(ids.a)).rejects.toThrow(NotFoundError)
  })

  it('не восстанавливается в заархивированный список', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await archiveCard(ids.a)
    await db
      .update(cards)
      .set({ archivedAt: new Date() })
      .where(and(eq(cards.id, ids.a), sql`true`))
    const { archiveList } = await import('./boards.ts')
    await archiveList(b.lists['Бэклог'])

    await expect(restoreCard(ids.a)).rejects.toThrow(InvalidInputError)
  })
})

describe('доска карточки по ссылке', () => {
  it('находится по живой карточке', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])

    expect(await findCardBoard(ids.a)).toBe(b.id)
  })

  it('архивная карточка и несуществующая дают null', async () => {
    const b = await board('Доска', ['Бэклог'])
    const ids = await fill(b.lists['Бэклог'], ['a'])
    await archiveCard(ids.a)

    expect(await findCardBoard(ids.a)).toBeNull()
    expect(await findCardBoard('00000000-0000-4000-8000-000000000000')).toBeNull()
  })
})
