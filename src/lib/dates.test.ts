import { describe, expect, it } from 'vitest'
import { formatDue, formatMoment, isOverdue, momentInMoscow, moscowParts } from './dates.ts'

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
    expect(isOverdue('2026-03-12T08:59:00Z', false, true, now)).toBe(true)
    expect(isOverdue('2026-03-12T08:59:00Z', true, true, now)).toBe(false)
    expect(isOverdue('2026-03-12T09:01:00Z', false, true, now)).toBe(false)
  })
})

describe('срок', () => {
  it('без времени рисуется одной датой', () => {
    const now = new Date('2026-03-12T09:00:00Z')
    expect(formatDue('2026-09-30T21:00:00Z', false, now)).toBe('1 окт.')
    expect(formatDue('2026-09-30T21:00:00Z', true, now)).toBe('1 окт., 00:00')
    expect(formatDue('2027-09-30T09:00:00Z', false, now)).toBe('30 сент. 2027 г.')
  })

  it('без времени держит весь свой день, а не краснеет с полуночи', () => {
    // 21:00 UTC тридцатого — московская полночь первого октября: это и есть срок «1 окт.»
    const due = '2026-09-30T21:00:00Z'
    expect(isOverdue(due, false, false, Date.parse('2026-10-01T20:00:00Z'))).toBe(false)
    expect(isOverdue(due, false, false, Date.parse('2026-10-01T21:00:00Z'))).toBe(true)
    expect(isOverdue(due, false, true, Date.parse('2026-10-01T20:00:00Z'))).toBe(true)
  })

  it('дата и время читаются как московские', () => {
    expect(momentInMoscow('2026-10-01', null).toISOString()).toBe('2026-09-30T21:00:00.000Z')
    expect(momentInMoscow('2026-10-01', '14:30').toISOString()).toBe('2026-10-01T11:30:00.000Z')
  })

  it('момент раскладывается обратно в те же дату и время', () => {
    for (const [date, time] of [
      ['2026-10-01', null],
      ['2026-01-01', '00:00'],
      ['2026-12-31', '23:59'],
      ['2027-06-15', '14:30'],
    ] as const) {
      const parts = moscowParts(momentInMoscow(date, time).toISOString())
      expect(parts.date).toBe(date)
      expect(parts.time).toBe(time ?? '00:00')
    }
  })
})
