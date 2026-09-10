import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeDays, dailyStats, summarize } from './daily.ts'
import { InvalidInputError } from './errors.ts'
import {
  addNoteItem,
  archiveNote,
  deleteNoteItem,
  getDailyNote,
  listNotes,
  noteToCard,
  updateNoteItem,
} from './notes.ts'

afterEach(() => {
  vi.useRealTimers()
})

// полдень по Москве: до полуночи далеко в обе стороны, и пояс день не сдвинет
function at(day: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${day}T09:00:00Z`))
}

async function itemsOf(...titles: string[]) {
  const daily = await getDailyNote()
  const items = []
  for (const title of titles) items.push(await addNoteItem({ noteId: daily.id, title }))
  return items
}

const closed = (from: string, to = from) => completeDays(from, to)

describe('список «Сегодня»', () => {
  it('заводится сам и ровно один', async () => {
    const first = await getDailyNote()
    const again = await getDailyNote()

    expect(again.id).toBe(first.id)
    expect(first).toMatchObject({ kind: 'list', title: 'Сегодня', daily: true, items: [] })
  })

  it('в общий список не попадает и в архив не уходит', async () => {
    const daily = await getDailyNote()

    expect(await listNotes({})).toEqual([])
    await expect(archiveNote(daily.id)).rejects.toThrow(InvalidInputError)
    await expect(
      noteToCard({ noteId: daily.id, listId: daily.id, title: 'x', archive: true }),
    ).rejects.toThrow(InvalidInputError)
  })

  it('отметка держится до конца дня', async () => {
    at('2026-09-10')
    const [item] = await itemsOf('зарядка')
    await updateNoteItem(item.id, { done: true })
    expect((await getDailyNote()).items[0].done).toBe(true)

    at('2026-09-11')
    expect((await getDailyNote()).items[0].done).toBe(false)
  })

  it('день закрыт, только когда отмечены все пункты', async () => {
    at('2026-09-10')
    const [one, two] = await itemsOf('один', 'два')

    await updateNoteItem(one.id, { done: true })
    expect(await closed('2026-09-10')).toEqual([])

    await updateNoteItem(two.id, { done: true })
    expect(await closed('2026-09-10')).toEqual(['2026-09-10'])

    const [three] = await itemsOf('три')
    expect(await closed('2026-09-10')).toEqual([])

    await deleteNoteItem(three.id)
    expect(await closed('2026-09-10')).toEqual(['2026-09-10'])

    await updateNoteItem(one.id, { done: false })
    expect(await closed('2026-09-10')).toEqual([])
  })

  it('пустой список день не закрывает', async () => {
    at('2026-09-10')
    const [item] = await itemsOf('один')
    await deleteNoteItem(item.id)

    expect(await closed('2026-09-10')).toEqual([])
  })

  it('прошедший день не меняется от сегодняшних правок', async () => {
    at('2026-09-10')
    const [item] = await itemsOf('один')
    await updateNoteItem(item.id, { done: true })

    at('2026-09-11')
    await itemsOf('два')
    await updateNoteItem(item.id, { done: true })

    expect(await closed('2026-09-10', '2026-09-11')).toEqual(['2026-09-10'])
  })

  it('вчерашняя отметка не закрывает сегодня', async () => {
    at('2026-09-10')
    const [one, two] = await itemsOf('один', 'два')
    await updateNoteItem(one.id, { done: true })

    at('2026-09-11')
    await updateNoteItem(two.id, { done: true })

    expect(await closed('2026-09-11')).toEqual([])
  })

  it('статистика считается из итогов дней', async () => {
    at('2026-09-10')
    const [item] = await itemsOf('один')
    await updateNoteItem(item.id, { done: true })

    const stats = await dailyStats('2026-09-10')
    expect(stats.periods[0]).toEqual({ days: 7, complete: 1, counted: 1 })
    expect(stats.streak).toEqual({ current: 1, best: 1 })
  })
})

describe('сводка по дням', () => {
  const day = (date: string, done: number, total = 2) => ({ day: date, total, done })

  it('без единой отметки — нули', () => {
    const stats = summarize([], '2026-09-10')

    expect(stats.periods.every((period) => period.counted === 0)).toBe(true)
    expect(stats.streak).toEqual({ current: 0, best: 0 })
  })

  it('считает с первого дня, незакрытое сегодня не в счёт', () => {
    const stats = summarize(
      [day('2026-09-07', 2), day('2026-09-08', 1), day('2026-09-09', 2)],
      '2026-09-10',
    )

    expect(stats.periods[0]).toEqual({ days: 7, complete: 2, counted: 3 })
    expect(stats.streak).toEqual({ current: 1, best: 1 })
  })

  it('окно не берёт дни раньше себя, всё время — с первого дня', () => {
    const stats = summarize([day('2026-08-01', 2), day('2026-09-09', 2)], '2026-09-10')

    expect(stats.periods[0]).toEqual({ days: 7, complete: 1, counted: 6 })
    expect(stats.periods[3]).toEqual({ days: null, complete: 2, counted: 40 })
  })

  it('серия тянется со вчера и растёт закрытым сегодня', () => {
    const rows = [day('2026-09-08', 2), day('2026-09-09', 2)]

    expect(summarize(rows, '2026-09-10').streak).toEqual({ current: 2, best: 2 })
    expect(summarize([...rows, day('2026-09-10', 2)], '2026-09-10').streak).toEqual({
      current: 3,
      best: 3,
    })
    expect(summarize(rows, '2026-09-11').streak).toEqual({ current: 0, best: 2 })
  })

  it('сетка недель кончается текущей и знает состояние дня', () => {
    const stats = summarize([day('2026-09-08', 1), day('2026-09-09', 2)], '2026-09-10')
    const week = stats.weeks[stats.weeks.length - 1]

    expect(week.map((cell) => cell.day)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ])
    expect(week.map((cell) => cell.state)).toEqual([
      'empty',
      'partial',
      'complete',
      'empty',
      'future',
      'future',
      'future',
    ])
  })
})
