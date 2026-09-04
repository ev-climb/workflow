import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { db } from '../db/client.ts'
import { calendarEvents, googleAccounts, googleCalendars } from '../db/schema.ts'
import { createBoard, createList } from '../services/boards.ts'
import { createCard, describeCard, setCardDue } from '../services/cards.ts'
import { createChecklist } from '../services/checklists.ts'
import { InvalidInputError, NotFoundError } from '../services/errors.ts'
import { createLabel } from '../services/labels.ts'
import { setBoardSlot } from '../services/workspace.ts'
import { TOOLS } from './tools.ts'

type Json = Record<string, unknown>

function call(name: string, input: unknown): Promise<unknown> {
  const found = TOOLS.find((tool) => tool.name === name)
  if (!found) throw new Error(`инструмента ${name} нет`)
  return found.run(input)
}

async function board(title = 'Работа') {
  const created = await createBoard({ title })
  const list = await createList({ boardId: created.id, title: 'Сейчас' })
  return { boardId: created.id, listId: list.id }
}

describe('набор инструментов', () => {
  it('имена не повторяются: одноимённый инструмент затёр бы соседа', () => {
    expect(new Set(TOOLS.map((tool) => tool.name)).size).toBe(TOOLS.length)
  })

  it('у каждого инструмента есть описание — по нему инструмент и выбирается', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0)
    }
  })

  it('схема входа переводится в JSON Schema: именно её и видит клиент', () => {
    for (const tool of TOOLS) {
      expect(() => z.toJSONSchema(tool.input), tool.name).not.toThrow()
    }
  })
})

describe('вход по схеме', () => {
  it('лишний идентификатор не uuid — ошибка входа, а не поломка базы', async () => {
    await expect(call('get_board', { boardId: 'доска' })).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('обязательный аргумент пропущен — ошибка входа', async () => {
    await expect(call('get_card', {})).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('пустая правка карточки не доходит до сервиса', async () => {
    const { listId } = await board()
    const card = await createCard({ listId, title: 'Починить пуши' })

    await expect(call('update_card', { cardId: card.id })).rejects.toBeInstanceOf(InvalidInputError)
  })

  it('несуществующая карточка — ошибка сервиса, схема тут ни при чём', async () => {
    await expect(
      call('get_card', { cardId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('форма ответа', () => {
  it('доски отдаются без рангов', async () => {
    await board('Работа')
    const boards = (await call('list_boards', {})) as Json[]

    expect(boards).toHaveLength(1)
    expect(boards[0]).toEqual({ id: expect.any(String), title: 'Работа' })
  })

  it('доска отдаётся без описаний карточек и без рангов', async () => {
    const { boardId, listId } = await board()
    const card = await createCard({ listId, title: 'Починить пуши' })
    await call('update_card', { cardId: card.id, description: 'длинное описание' })

    const full = (await call('get_board', { boardId })) as Json
    const lists = full.lists as Json[]
    const cards = lists[0].cards as Json[]

    expect(cards[0]).toEqual({ id: card.id, title: 'Починить пуши' })
    expect(JSON.stringify(full)).not.toContain('длинное описание')
    expect(JSON.stringify(full)).not.toContain('rank')
  })

  it('карточка целиком отдаёт описание, метки и чек-листы', async () => {
    const { boardId, listId } = await board()
    const card = await createCard({ listId, title: 'Починить пуши' })
    const label = await createLabel({ boardId, name: 'баг', color: 'red' })
    const checklist = await createChecklist({ cardId: card.id, title: 'Шаги' })
    await call('update_card', {
      cardId: card.id,
      description: 'воспроизвести на двух аккаунтах',
      addLabelIds: [label.id],
    })
    await call('add_checklist_item', { checklistId: checklist.id, title: 'собрать логи' })

    const detail = (await call('get_card', { cardId: card.id })) as Json

    expect(detail.description).toBe('воспроизвести на двух аккаунтах')
    expect(detail.labels).toEqual([{ id: label.id, name: 'баг' }])
    expect((detail.checklists as Json[])[0]).toMatchObject({
      title: 'Шаги',
      items: [{ title: 'собрать логи', done: false }],
    })
  })

  it('срок отдаётся московскими датой и временем, а не UTC', async () => {
    const { listId } = await board()
    const card = await createCard({ listId, title: 'Созвон' })
    await call('update_card', { cardId: card.id, due: { date: '2026-09-02', time: '10:00' } })

    const detail = (await call('get_card', { cardId: card.id })) as Json
    expect(detail.due).toBe('2026-09-02 10:00')
    expect(detail.dueDone).toBe(false)
  })

  it('срок без времени отдаётся одной датой', async () => {
    const { listId } = await board()
    const card = await createCard({ listId, title: 'Отчёт' })
    await call('update_card', { cardId: card.id, due: { date: '2026-09-01', time: null } })

    expect(((await call('get_card', { cardId: card.id })) as Json).due).toBe('2026-09-01')
  })

  it('карточка без срока не тащит с собой пустых полей', async () => {
    const { listId } = await board()
    const card = await createCard({ listId, title: 'Без срока' })

    const detail = (await call('get_card', { cardId: card.id })) as Json
    expect('due' in detail).toBe(false)
    expect('dueDone' in detail).toBe(false)
  })

  it('перенос карточки не отдаёт ранг наружу', async () => {
    const { boardId, listId } = await board()
    const done = await createList({ boardId, title: 'Готово' })
    const card = await createCard({ listId, title: 'Починить пуши' })

    const moved = (await call('move_card', { cardId: card.id, listId: done.id })) as Json

    expect(moved).toEqual({
      id: card.id,
      title: 'Починить пуши',
      list: 'Готово',
      board: 'Работа',
    })
  })

  it('архивирование подтверждается заголовком, а карточка уходит с доски', async () => {
    const { boardId, listId } = await board()
    const card = await createCard({ listId, title: 'Починить пуши' })

    expect(await call('archive_card', { cardId: card.id })).toEqual({
      id: card.id,
      title: 'Починить пуши',
      archived: true,
    })

    const lists = ((await call('get_board', { boardId })) as Json).lists as Json[]
    expect(lists[0].cards).toEqual([])
  })

  it('пункт чек-листа заводится сразу отмеченным', async () => {
    const { listId } = await board()
    const card = await createCard({ listId, title: 'Починить пуши' })
    const checklist = await createChecklist({ cardId: card.id, title: 'Шаги' })

    const item = (await call('add_checklist_item', {
      checklistId: checklist.id,
      title: 'собрать логи',
      done: true,
    })) as Json

    expect(item).toEqual({ id: expect.any(String), title: 'собрать логи', done: true })
  })
})

describe('новая карточка', () => {
  it('разбирает строку быстрого создания: срок и метка уезжают из заголовка', async () => {
    const { boardId, listId } = await board()
    const label = await createLabel({ boardId, name: 'баг', color: 'red' })

    const created = (await call('create_card', {
      listId,
      text: 'Починить пуши #баг',
    })) as Json

    expect(created.title).toBe('Починить пуши')
    expect(created.labels).toEqual([{ id: label.id, name: 'баг' }])
  })
})

describe('поиск карточек', () => {
  it('ищет по тексту в заголовке и описании', async () => {
    const { listId } = await board()
    const pushes = await createCard({ listId, title: 'Починить пуши' })
    const report = await createCard({ listId, title: 'Отчёт' })
    await call('update_card', { cardId: report.id, description: 'про пуши тоже' })
    await createCard({ listId, title: 'Созвон' })

    const found = (await call('search_cards', { text: 'пуши' })) as Json[]

    expect(found.map((hit) => hit.id).sort()).toEqual([pushes.id, report.id].sort())
  })

  it('ищет по метке и по доске', async () => {
    const first = await board('Работа')
    const second = await board('Дом')
    const label = await createLabel({ boardId: first.boardId, name: 'баг', color: 'red' })
    const card = await createCard({ listId: first.listId, title: 'Починить пуши' })
    await createCard({ listId: second.listId, title: 'Починить пуши' })
    await call('update_card', { cardId: card.id, addLabelIds: [label.id] })

    const byLabel = (await call('search_cards', { labelId: label.id })) as Json[]
    expect(byLabel.map((hit) => hit.id)).toEqual([card.id])
    expect(
      ((await call('search_cards', { boardId: second.boardId })) as Json[]).map((h) => h.board),
    ).toEqual(['Дом'])
  })

  it('окно срока берётся московскими датами, бессрочные не приезжают', async () => {
    const { listId } = await board()
    const first = await createCard({ listId, title: 'Первое число' })
    await call('update_card', { cardId: first.id, due: { date: '2026-09-01', time: null } })
    await createCard({ listId, title: 'Без срока' })

    const found = (await call('search_cards', {
      dueFrom: '2026-09-01',
      dueTo: '2026-09-01',
    })) as Json[]

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: first.id, due: '2026-09-01' })
  })

  it('выдача обрезана пределом', async () => {
    const { listId } = await board()
    for (const title of ['первая', 'вторая', 'третья']) {
      await createCard({ listId, title })
    }

    expect((await call('search_cards', { limit: 2 })) as Json[]).toHaveLength(2)
  })

  it('кривая граница срока — ошибка входа', async () => {
    await expect(call('search_cards', { dueFrom: '2 сентября' })).rejects.toBeInstanceOf(
      InvalidInputError,
    )
  })
})

describe('события календаря', () => {
  async function calendarWith(values: Partial<typeof calendarEvents.$inferInsert>) {
    const [account] = await db
      .insert(googleAccounts)
      .values({ email: 'me@gmail.com', refreshTokenEncrypted: 'шифротекст' })
      .returning({ id: googleAccounts.id })

    const [calendar] = await db
      .insert(googleCalendars)
      .values({ accountId: account.id, googleCalendarId: 'me@gmail.com', title: 'Личный' })
      .returning({ id: googleCalendars.id })

    await db
      .insert(calendarEvents)
      .values({ calendarId: calendar.id, googleEventId: 'e1', title: 'Созвон', ...values })
  }

  it('событие со временем отдаётся московскими моментами', async () => {
    await calendarWith({
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T10:00:00Z'),
    })

    const events = (await call('list_events', { from: '2026-09-02', to: '2026-09-02' })) as Json[]

    expect(events[0]).toMatchObject({ title: 'Созвон', from: '2026-09-02 12:00' })
  })

  it('событие на весь день отдаётся датами и не уезжает на сутки', async () => {
    await calendarWith({ allDay: true, startDate: '2026-09-01', endDate: '2026-09-02' })

    const events = (await call('list_events', { from: '2026-09-01', to: '2026-09-01' })) as Json[]

    expect(events[0]).toMatchObject({ allDay: true, from: '2026-09-01', to: '2026-09-02' })
  })

  it('кривое окно — ошибка входа', async () => {
    await expect(
      call('list_events', { from: '2026-09-02', to: '2026-09-01' }),
    ).rejects.toBeInstanceOf(InvalidInputError)
  })
})

describe('plan_day', () => {
  it('день кривой — ошибка входа, а не план за случайную дату', async () => {
    await expect(call('plan_day', { date: '02.09.2026' })).rejects.toBeInstanceOf(
      InvalidInputError,
    )
  })

  it('без аргументов берёт сегодняшний день', async () => {
    const plan = (await call('plan_day', {})) as Json

    expect(plan.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('отдаёт рабочие колонки стола компактно: срок строкой, описаний нет', async () => {
    const created = await createBoard({ title: 'BetaSet' })
    const list = await createList({ boardId: created.id, title: 'Сейчас (максимум 3)' })
    const card = await createCard({ listId: list.id, title: 'Починить пуши' })
    await describeCard(card.id, 'длинное описание, которому здесь не место')
    await setCardDue(card.id, { date: '2026-09-02', time: '12:00' })
    await setBoardSlot('top', created.id)
    await setBoardSlot('bottom', null)

    const plan = (await call('plan_day', { date: '2026-09-02' })) as Json
    const boards = plan.boards as Json[]
    const inWork = boards[0].inWork as Json[]
    const cards = inWork[0].cards as Json[]

    expect(inWork[0].title).toBe('Сейчас (максимум 3)')
    expect(cards[0]).toMatchObject({ title: 'Починить пуши', due: '2026-09-02 12:00' })
    expect(cards[0]).not.toHaveProperty('description')
  })
})
