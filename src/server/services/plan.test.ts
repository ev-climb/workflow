import { describe, expect, it } from 'vitest'
import { db } from '../db/client.ts'
import { calendarEvents, googleAccounts, googleCalendars } from '../db/schema.ts'
import { createBoard, createList } from './boards.ts'
import { createCard, setCardDue } from './cards.ts'
import { InvalidInputError } from './errors.ts'
import { planDay } from './plan.ts'
import { createTimeBlock } from './time-blocks.ts'
import { setBoardSlot } from './workspace.ts'

const DAY = '2026-09-02'

async function boardWith(title: string, listTitles: string[]) {
  const board = await createBoard({ title })
  const lists = []
  for (const listTitle of listTitles) {
    lists.push(await createList({ boardId: board.id, title: listTitle }))
  }
  return { id: board.id, lists }
}

async function eventAt(startsAt: string, endsAt: string) {
  const [account] = await db
    .insert(googleAccounts)
    .values({ email: 'me@example.com', refreshTokenEncrypted: 'x' })
    .returning()
  const [calendar] = await db
    .insert(googleCalendars)
    .values({ accountId: account.id, googleCalendarId: 'primary', title: 'Основной' })
    .returning()
  await db.insert(calendarEvents).values({
    calendarId: calendar.id,
    googleEventId: 'e1',
    title: 'Созвон',
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  })
}

describe('план дня', () => {
  it('кривая дата — ошибка входа, а не выборка за случайный день', async () => {
    await expect(planDay('02.09.2026')).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('на пустой базе отдаёт пустой план, а не падает', async () => {
    const plan = await planDay(DAY)

    expect(plan).toMatchObject({ date: DAY, events: [], timeBlocks: [], due: [], boards: [] })
  })

  it('берёт доски из слотов стола, а не все подряд', async () => {
    const top = await boardWith('BetaSet', ['Бэклог', 'Сейчас (максимум 3)'])
    const bottom = await boardWith('Job', ['Все задачи', 'В работе'])
    const third = await boardWith('Личное', ['В работе'])
    await setBoardSlot('top', top.id)
    await setBoardSlot('bottom', bottom.id)

    const plan = await planDay(DAY)

    expect(plan.boards.map((board) => board.title)).toEqual(['BetaSet', 'Job'])
    expect(plan.boards.some((board) => board.id === third.id)).toBe(false)
  })

  it('одна доска в обоих слотах считается один раз', async () => {
    const board = await boardWith('BetaSet', ['Сейчас'])
    await setBoardSlot('top', board.id)
    await setBoardSlot('bottom', board.id)

    const plan = await planDay(DAY)

    expect(plan.boards).toHaveLength(1)
  })

  it('рабочая колонка опознаётся по названию с уточнением в скобках', async () => {
    const board = await boardWith('BetaSet', ['Бэклог', 'Сейчас (максимум 3)', 'Готово'])
    await setBoardSlot('top', board.id)
    await setBoardSlot('bottom', null)
    await createCard({ listId: board.lists[1].id, title: 'Починить пуши' })

    const plan = await planDay(DAY)

    expect(plan.boards[0].inWork).toHaveLength(1)
    expect(plan.boards[0].inWork[0].title).toBe('Сейчас (максимум 3)')
    expect(plan.boards[0].inWork[0].cards.map((card) => card.title)).toEqual(['Починить пуши'])
  })

  it('колонка с лимитом считается рабочей, как бы ни называлась', async () => {
    const board = await createBoard({ title: 'Job' })
    await createList({ boardId: board.id, title: 'Бэклог' })
    await createList({ boardId: board.id, title: 'Загадочное', wipLimit: 3 })
    await setBoardSlot('top', board.id)
    await setBoardSlot('bottom', null)

    const plan = await planDay(DAY)

    expect(plan.boards[0].inWork.map((list) => list.title)).toEqual(['Загадочное'])
  })

  it('рабочая колонка не опозналась — отдаёт названия колонок, чтобы пустота объяснилась', async () => {
    const board = await boardWith('Job', ['Идеи', 'Готово'])
    await setBoardSlot('top', board.id)
    await setBoardSlot('bottom', null)

    const plan = await planDay(DAY)

    expect(plan.boards[0].inWork).toEqual([])
    expect(plan.boards[0].lists).toEqual(['Идеи', 'Готово'])
  })

  it('сроки берутся за этот день и следующий, послезавтрашний не попадает', async () => {
    const board = await boardWith('BetaSet', ['Сейчас'])
    await setBoardSlot('top', board.id)
    await setBoardSlot('bottom', null)

    const today = await createCard({ listId: board.lists[0].id, title: 'Сегодня' })
    const tomorrow = await createCard({ listId: board.lists[0].id, title: 'Завтра' })
    const later = await createCard({ listId: board.lists[0].id, title: 'Послезавтра' })
    await setCardDue(today.id, { date: DAY, time: '12:00' })
    await setCardDue(tomorrow.id, { date: '2026-09-03', time: '12:00' })
    await setCardDue(later.id, { date: '2026-09-04', time: '12:00' })

    const plan = await planDay(DAY)

    expect(plan.due.map((card) => card.title)).toEqual(['Сегодня', 'Завтра'])
  })

  it('события и тайм-блоки дня приезжают тем же вызовом', async () => {
    const board = await boardWith('BetaSet', ['Сейчас'])
    await setBoardSlot('top', board.id)
    await setBoardSlot('bottom', null)
    const card = await createCard({ listId: board.lists[0].id, title: 'Починить пуши' })

    await eventAt('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')
    await createTimeBlock({
      cardId: card.id,
      startsAt: new Date('2026-09-02T13:00:00Z'),
      endsAt: new Date('2026-09-02T14:00:00Z'),
    })

    const plan = await planDay(DAY)

    expect(plan.events.map((event) => event.title)).toEqual(['Созвон'])
    expect(plan.timeBlocks.map((block) => block.cardTitle)).toEqual(['Починить пуши'])
  })
})
