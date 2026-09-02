import { describe, expect, it } from 'vitest'
import { MIN_EVENT_MINUTES, placeDay, type TimedEvent } from './calendar-layout'

const DAY = '2026-09-02'

/** Границы задаются московскими стенными часами: их и показывает сетка. */
function event(id: string, from: string, to: string): TimedEvent {
  return { id, startsAt: moment(from), endsAt: moment(to) }
}

// смещение Москвы в сентябре +03:00, поэтому в тесте оно записано прямо в момент
function moment(wall: string): string {
  const [date, time] = wall.includes(' ') ? wall.split(' ') : [DAY, wall]
  return `${date}T${time}:00+03:00`
}

function shown(placed: ReturnType<typeof placeDay<TimedEvent>>) {
  return placed.map((one) => ({
    id: one.event.id,
    start: one.start,
    end: one.end,
    column: one.column,
    columns: one.columns,
  }))
}

describe('placeDay', () => {
  it('кладёт событие по московским часам, а не по UTC', () => {
    expect(shown(placeDay([event('a', '09:00', '10:00')], DAY))).toEqual([
      { id: 'a', start: 540, end: 600, column: 0, columns: 1 },
    ])
  })

  it('не берёт событие соседнего дня', () => {
    const other = event('a', '2026-09-03 09:00', '2026-09-03 10:00')
    expect(placeDay([other], DAY)).toEqual([])
  })

  it('обрезает событие через полночь границей дня и отдаёт его обоим дням', () => {
    const night = event('a', '2026-09-02 23:00', '2026-09-03 01:00')

    expect(shown(placeDay([night], DAY))).toEqual([
      { id: 'a', start: 23 * 60, end: 24 * 60, column: 0, columns: 1 },
    ])
    expect(shown(placeDay([night], '2026-09-03'))).toEqual([
      { id: 'a', start: 0, end: 60, column: 0, columns: 1 },
    ])
  })

  it('не считает попаданием касание границы дня', () => {
    expect(placeDay([event('a', '2026-09-01 22:00', '2026-09-02 00:00')], DAY)).toEqual([])
    expect(placeDay([event('b', '2026-09-03 00:00', '2026-09-03 02:00')], DAY)).toEqual([])
  })

  it('растягивает слишком короткое событие до читаемой высоты', () => {
    const [placed] = placeDay([event('a', '09:00', '09:05')], DAY)
    expect(placed.end - placed.start).toBe(MIN_EVENT_MINUTES)
  })

  it('делит ширину между пересекающимися событиями', () => {
    const placed = placeDay([event('a', '09:00', '11:00'), event('b', '10:00', '12:00')], DAY)
    expect(shown(placed)).toEqual([
      { id: 'a', start: 540, end: 660, column: 0, columns: 2 },
      { id: 'b', start: 600, end: 720, column: 1, columns: 2 },
    ])
  })

  it('не делит ширину между событиями, идущими встык', () => {
    const placed = placeDay([event('a', '09:00', '10:00'), event('b', '10:00', '11:00')], DAY)
    expect(placed.map((one) => one.columns)).toEqual([1, 1])
  })

  it('даёт всему ряду пересечений одинаковое число столбцов', () => {
    const placed = placeDay(
      [
        event('a', '09:00', '12:00'),
        event('b', '09:30', '10:30'),
        event('c', '10:00', '11:00'),
      ],
      DAY,
    )
    expect(shown(placed)).toEqual([
      { id: 'a', start: 540, end: 720, column: 0, columns: 3 },
      { id: 'b', start: 570, end: 630, column: 1, columns: 3 },
      { id: 'c', start: 600, end: 660, column: 2, columns: 3 },
    ])
  })

  it('переиспользует освободившийся столбец', () => {
    const placed = placeDay(
      [
        event('a', '09:00', '13:00'),
        event('b', '09:30', '10:30'),
        event('c', '11:00', '12:00'),
      ],
      DAY,
    )
    expect(shown(placed)).toEqual([
      { id: 'a', start: 540, end: 780, column: 0, columns: 2 },
      { id: 'b', start: 570, end: 630, column: 1, columns: 2 },
      { id: 'c', start: 660, end: 720, column: 1, columns: 2 },
    ])
  })

  it('разводит соседние ряды пересечений по отдельности', () => {
    const placed = placeDay(
      [
        event('a', '09:00', '10:00'),
        event('b', '09:30', '10:00'),
        event('c', '14:00', '15:00'),
      ],
      DAY,
    )
    expect(placed.map((one) => one.columns)).toEqual([2, 2, 1])
  })

  it('относит момент к московским суткам, а не к UTC-суткам', () => {
    // 22:30 UTC — это уже 01:30 следующего дня в Москве
    const late = { id: 'a', startsAt: '2026-09-02T22:30:00Z', endsAt: '2026-09-02T23:30:00Z' }

    expect(placeDay([late], DAY)).toEqual([])
    expect(shown(placeDay([late], '2026-09-03'))).toEqual([
      { id: 'a', start: 90, end: 150, column: 0, columns: 1 },
    ])
  })
})
