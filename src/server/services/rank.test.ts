import { describe, expect, it, vi } from 'vitest'
import { InvalidInputError, ConflictError } from './errors.ts'
import {
  isRankCollision,
  rankAfter,
  rankBefore,
  rankBetween,
  rankSequence,
  withRankRetry,
} from './rank.ts'

/** Ранги сравниваются побайтно — так же, как колонки с `collate "C"` в базе. */
const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const collision = (constraint = 'cards_list_id_rank_key') =>
  Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint_name: constraint,
  })

describe('вставка в пустую коллекцию', () => {
  it('даёт ранг и в начало, и в конец', () => {
    expect(rankBefore(null)).toBe(rankAfter(null))
    expect(rankBetween(null, null)).toBe(rankAfter(null))
  })
})

describe('вставка в начало', () => {
  it('ранг меньше первого', () => {
    const first = rankAfter(null)
    expect(byBytes(rankBefore(first), first)).toBe(-1)
  })

  it('выдерживает сто вставок подряд в одно и то же место', () => {
    let head = rankAfter(null)
    for (let i = 0; i < 100; i++) {
      const next = rankBefore(head)
      expect(byBytes(next, head)).toBe(-1)
      head = next
    }
    // порог пересмотра из ADR-001: ранг длиннее сотни символов — сценарий, о котором не подумали
    expect(head.length).toBeLessThan(100)
  })
})

describe('вставка в конец', () => {
  it('ранг больше последнего', () => {
    const last = rankAfter(null)
    expect(byBytes(rankAfter(last), last)).toBe(1)
  })

  it('сто вставок подряд идут по возрастанию', () => {
    const ranks = [rankAfter(null)]
    for (let i = 0; i < 100; i++) ranks.push(rankAfter(ranks.at(-1)!))
    expect([...ranks].sort(byBytes)).toEqual(ranks)
  })
})

describe('вставка в середину', () => {
  it('ранг лежит строго между соседями', () => {
    const [a, b] = rankSequence(2)
    const mid = rankBetween(a, b)
    expect(byBytes(a, mid)).toBe(-1)
    expect(byBytes(mid, b)).toBe(-1)
  })

  it('пятьдесят вставок между одной и той же парой сохраняют порядок', () => {
    const [a, b] = rankSequence(2)
    let right = b
    const between: string[] = []
    for (let i = 0; i < 50; i++) {
      right = rankBetween(a, right)
      between.push(right)
    }
    const all = [a, ...[...between].reverse(), b]
    expect([...all].sort(byBytes)).toEqual(all)
    expect(new Set(all).size).toBe(all.length)
  })

  it('соседи в обратном порядке меняются местами, ранг всё равно между ними', () => {
    const [a, b] = rankSequence(2)
    const mid = rankBetween(b, a)
    expect(byBytes(a, mid)).toBe(-1)
    expect(byBytes(mid, b)).toBe(-1)
  })

  it('два одинаковых соседа — ошибка входа, а не молчаливый мусор', () => {
    const [a] = rankSequence(1)
    expect(() => rankBetween(a, a)).toThrow(InvalidInputError)
  })
})

describe('последовательность рангов для импорта', () => {
  it('идёт по возрастанию и без повторов', () => {
    const ranks = rankSequence(200)
    expect(ranks).toHaveLength(200)
    expect([...ranks].sort(byBytes)).toEqual(ranks)
    expect(new Set(ranks).size).toBe(200)
  })

  it('пустая коллекция — пустой список, отрицательная длина — ошибка', () => {
    expect(rankSequence(0)).toEqual([])
    expect(() => rankSequence(-1)).toThrow(InvalidInputError)
    expect(() => rankSequence(1.5)).toThrow(InvalidInputError)
  })
})

describe('коллизия ранга', () => {
  it('опознаётся под обёрткой drizzle: она прячет ошибку драйвера в cause', () => {
    const wrapped = new Error('Failed query: update "cards" set ...', { cause: collision() })
    expect(isRankCollision(wrapped)).toBe(true)
    expect(isRankCollision(new Error('внешняя', { cause: new Error('внутренняя') }))).toBe(false)
  })

  it('опознаётся по коду и имени индекса', () => {
    expect(isRankCollision(collision())).toBe(true)
    expect(isRankCollision(collision('checklists_card_id_rank_key'))).toBe(true)
    expect(isRankCollision(collision('boards_trello_id_key'))).toBe(false)
    expect(isRankCollision(Object.assign(new Error('x'), { code: '23503' }))).toBe(false)
    expect(isRankCollision(new Error('x'))).toBe(false)
    expect(isRankCollision(null)).toBe(false)
  })

  it('запись повторяется, и второй заход проходит', async () => {
    const write = vi.fn<() => Promise<string>>()
    write.mockRejectedValueOnce(collision()).mockResolvedValueOnce('ok')
    await expect(withRankRetry(write)).resolves.toBe('ok')
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('после исчерпания попыток бросается типизированная ошибка, а не ошибка драйвера', async () => {
    const write = vi.fn<() => Promise<string>>().mockRejectedValue(collision())
    await expect(withRankRetry(write, 3)).rejects.toThrow(ConflictError)
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('чужая ошибка пробрасывается сразу, без повторов', async () => {
    const boom = new Error('соединение с базой потеряно')
    const write = vi.fn<() => Promise<string>>().mockRejectedValue(boom)
    await expect(withRankRetry(write)).rejects.toBe(boom)
    expect(write).toHaveBeenCalledTimes(1)
  })
})
