import { describe, expect, it } from 'vitest'
import { DROP_STEP, DUE_DROP, dayAt, dropMinutes, dropTime, isDueDrop } from './calendar-drop.ts'

/** Высота дневной колонки на сетке: 24 часа по 44 пикселя. */
const HEIGHT = 44 * 24

describe('время броска', () => {
  it('верх колонки — полночь, середина — полдень', () => {
    expect(dropMinutes(0, HEIGHT)).toBe(0)
    expect(dropMinutes(HEIGHT / 2, HEIGHT)).toBe(12 * 60)
  })

  it('притягивается к шагу вниз, а не к ближайшему', () => {
    const at = (minutes: number) => dropMinutes((minutes / (24 * 60)) * HEIGHT, HEIGHT)

    expect(at(10 * 60 + 7)).toBe(10 * 60)
    expect(at(10 * 60 + 52)).toBe(10 * 60 + 45)
    expect(at(10 * 60 + 15)).toBe(10 * 60 + 15)
  })

  it('промах мимо колонки остаётся в своих сутках', () => {
    expect(dropMinutes(-200, HEIGHT)).toBe(0)
    expect(dropMinutes(HEIGHT + 200, HEIGHT)).toBe(24 * 60 - DROP_STEP)
  })

  it('колонка без высоты не роняет расчёт', () => {
    expect(dropMinutes(100, 0)).toBe(0)
  })
})

describe('время на часах', () => {
  it('собирается с ведущими нулями', () => {
    expect(dropTime(0)).toBe('00:00')
    expect(dropTime(9 * 60 + 5)).toBe('09:05')
    expect(dropTime(23 * 60 + 45)).toBe('23:45')
  })
})

describe('цель календаря', () => {
  it('узнаётся среди целей стола', () => {
    expect(isDueDrop(DUE_DROP)).toBe(true)
    expect(isDueDrop({ type: 'card', boardId: 'b', listId: 'l' })).toBe(false)
    expect(isDueDrop(undefined)).toBe(false)
  })
})

/** Сетка недели на 350 пикселей: семь колонок по полсотни. */
const week = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']

const node = (box: { left: number; right: number; top: number; bottom: number }) => ({
  getBoundingClientRect: () => box,
})

describe('день под курсором', () => {
  const grid = node({ left: 50, right: 400, top: 100, bottom: 300 })

  it('считается долей ширины сетки', () => {
    expect(dayAt(grid, { x: 55, y: 150 }, week)).toBe('2026-08-31')
    expect(dayAt(grid, { x: 175, y: 150 }, week)).toBe('2026-09-02')
    expect(dayAt(grid, { x: 399, y: 150 }, week)).toBe('2026-09-06')
  })

  it('правый край сетки остаётся последним днём, а не восьмым', () => {
    expect(dayAt(grid, { x: 400, y: 150 }, week)).toBe('2026-09-06')
  })

  it('мимо сетки — не день', () => {
    expect(dayAt(grid, { x: 49, y: 150 }, week)).toBeNull()
    expect(dayAt(grid, { x: 175, y: 99 }, week)).toBeNull()
    expect(dayAt(null, { x: 175, y: 150 }, week)).toBeNull()
    expect(dayAt(grid, { x: 175, y: 150 }, [])).toBeNull()
  })

  it('дневной вид отдаёт свой единственный день с любой точки', () => {
    expect(dayAt(grid, { x: 55, y: 150 }, ['2026-09-02'])).toBe('2026-09-02')
    expect(dayAt(grid, { x: 399, y: 150 }, ['2026-09-02'])).toBe('2026-09-02')
  })
})
