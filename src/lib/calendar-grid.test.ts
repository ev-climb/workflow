import { describe, expect, it } from 'vitest'
import {
  daysOf,
  isToday,
  moscowToday,
  nowOffset,
  rangeLabel,
  shiftAnchor,
  weekdayLabel,
} from './calendar-grid.ts'

describe('дни сетки', () => {
  it('дневной вид показывает ровно свой день', () => {
    expect(daysOf('day', '2026-09-02')).toEqual(['2026-09-02'])
  })

  it('недельный вид идёт с понедельника по воскресенье', () => {
    const week = daysOf('week', '2026-09-02')

    expect(week).toHaveLength(7)
    expect(week[0]).toBe('2026-08-31')
    expect(week[6]).toBe('2026-09-06')
  })

  it('воскресенье остаётся в своей неделе, а не открывает следующую', () => {
    expect(daysOf('week', '2026-09-06')[0]).toBe('2026-08-31')
  })

  it('понедельник — начало своей же недели', () => {
    expect(daysOf('week', '2026-08-31')[0]).toBe('2026-08-31')
  })
})

describe('листание', () => {
  it('дневной вид шагает сутками через границу месяца', () => {
    expect(shiftAnchor('day', '2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftAnchor('day', '2026-01-01', -1)).toBe('2025-12-31')
  })

  it('недельный вид шагает семёрками', () => {
    expect(shiftAnchor('week', '2026-09-02', 1)).toBe('2026-09-09')
    expect(shiftAnchor('week', '2026-09-02', -1)).toBe('2026-08-26')
  })

  it('перевод часов не съедает сутки', () => {
    // в ночь на 25 октября Европа отводит часы назад; дата сетки не должна это заметить
    expect(shiftAnchor('day', '2026-10-24', 1)).toBe('2026-10-25')
    expect(shiftAnchor('day', '2026-10-25', 1)).toBe('2026-10-26')
    expect(daysOf('week', '2026-10-25')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
  })
})

describe('подписи', () => {
  it('день дня недели не путает', () => {
    expect(weekdayLabel('2026-09-02')).toBe('ср')
    expect(weekdayLabel('2026-09-06')).toBe('вс')
  })

  it('дневной вид подписан полной датой, недельный — границами', () => {
    expect(rangeLabel('day', ['2026-09-02'])).toBe('2 сентября 2026 г.')
    expect(rangeLabel('week', daysOf('week', '2026-09-02'))).toBe('31 авг. — 6 сентября 2026 г.')
  })
})

describe('текущий момент', () => {
  // TZ машины в тестах — UTC: московские сутки начинаются на три часа раньше здешних
  it('дата считается по-московски, а не по поясу машины', () => {
    expect(moscowToday(new Date('2026-09-01T21:30:00Z'))).toBe('2026-09-02')
    expect(isToday('2026-09-02', new Date('2026-09-01T21:30:00Z'))).toBe(true)
  })

  it('линия встаёт на московские минуты от полуночи', () => {
    const now = new Date('2026-09-02T10:15:00Z')

    expect(nowOffset(['2026-09-02'], now)).toEqual({ date: '2026-09-02', minutes: 13 * 60 + 15 })
  })

  it('линии нет, если сегодняшнего дня на сетке не видно', () => {
    expect(nowOffset(['2026-09-10'], new Date('2026-09-02T10:15:00Z'))).toBeNull()
  })

  it('в недельном виде линия знает свой день', () => {
    const week = daysOf('week', '2026-09-02')

    expect(nowOffset(week, new Date('2026-09-04T21:05:00Z'))?.date).toBe('2026-09-05')
  })
})
