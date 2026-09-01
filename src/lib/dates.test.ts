import { describe, expect, it } from 'vitest'
import { formatMoment, isOverdue } from './dates.ts'

describe('даты на экране', () => {
  it('рисуется в московском времени, а не в UTC', () => {
    // 21:30 UTC двенадцатого — это уже 00:30 тринадцатого в Москве
    expect(formatMoment('2026-03-12T21:30:00Z', new Date('2026-03-12T21:30:00Z'))).toBe(
      '13 мар., 00:30',
    )
  })

  it('в том же году показывается без года, в другом — с годом', () => {
    const now = new Date('2026-03-12T09:00:00Z')
    expect(formatMoment('2026-09-30T09:00:00Z', now)).toBe('30 сент., 12:00')
    expect(formatMoment('2027-09-30T09:00:00Z', now)).toBe('30 сент. 2027 г.')
  })

  it('год берётся московский: 31 декабря по UTC уже следующий год в Москве', () => {
    const now = new Date('2026-12-31T23:00:00Z')
    expect(formatMoment('2027-01-01T10:00:00Z', now)).toBe('1 янв., 13:00')
  })

  it('просрочен только незакрытый срок в прошлом', () => {
    const now = Date.parse('2026-03-12T09:00:00Z')
    expect(isOverdue('2026-03-12T08:59:00Z', false, now)).toBe(true)
    expect(isOverdue('2026-03-12T08:59:00Z', true, now)).toBe(false)
    expect(isOverdue('2026-03-12T09:01:00Z', false, now)).toBe(false)
  })
})
