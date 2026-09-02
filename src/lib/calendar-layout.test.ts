import { describe, expect, it } from 'vitest'
import {
  MIN_EVENT_MINUTES,
  placeAllDay,
  placeDay,
  placeDues,
  type AllDayEvent,
  type DueItem,
  type TimedEvent,
} from './calendar-layout'
import { daysOf } from './calendar-grid'

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

const WEEK = daysOf('week', '2026-09-02')

function whole(id: string, from: string, to: string): AllDayEvent {
  return { id, startDate: from, endDate: to }
}

function band(placed: ReturnType<typeof placeAllDay<AllDayEvent>>) {
  return placed.map((one) => ({
    id: one.event.id,
    index: one.index,
    span: one.span,
    lane: one.lane,
  }))
}

describe('placeAllDay', () => {
  it('однодневное событие занимает один день: endDate исключающая', () => {
    expect(band(placeAllDay([whole('a', '2026-09-02', '2026-09-03')], WEEK))).toEqual([
      { id: 'a', index: 2, span: 1, lane: 0 },
    ])
  })

  it('многодневное растягивается по дням окна', () => {
    expect(band(placeAllDay([whole('a', '2026-09-03', '2026-09-06')], WEEK))).toEqual([
      { id: 'a', index: 3, span: 3, lane: 0 },
    ])
  })

  it('вышедшее за окно обрезается краями и помечает их', () => {
    const [placed] = placeAllDay([whole('a', '2026-08-28', '2026-09-09')], WEEK)

    expect(placed).toMatchObject({ index: 0, span: 7, clippedStart: true, clippedEnd: true })
  })

  it('целиком мимо окна не показывается', () => {
    const away = [whole('a', '2026-09-08', '2026-09-09'), whole('b', '2026-08-24', '2026-08-31')]

    expect(placeAllDay(away, WEEK)).toEqual([])
  })

  it('пересекающиеся становятся рядами, разошедшиеся делят ряд', () => {
    const events = [
      whole('long', '2026-08-31', '2026-09-03'),
      whole('inside', '2026-09-01', '2026-09-02'),
      whole('after', '2026-09-04', '2026-09-05'),
    ]

    expect(band(placeAllDay(events, WEEK))).toEqual([
      { id: 'long', index: 0, span: 3, lane: 0 },
      { id: 'inside', index: 1, span: 1, lane: 1 },
      { id: 'after', index: 4, span: 1, lane: 0 },
    ])
  })

  it('первое число месяца не уезжает на сутки', () => {
    const october = daysOf('week', '2026-10-01')

    expect(band(placeAllDay([whole('a', '2026-10-01', '2026-10-02')], october))).toEqual([
      { id: 'a', index: 3, span: 1, lane: 0 },
    ])
  })

  it('перевод часов день полосы не сдвигает', () => {
    const week = daysOf('week', '2026-10-25')

    expect(band(placeAllDay([whole('a', '2026-10-25', '2026-10-27')], week))).toEqual([
      { id: 'a', index: 6, span: 1, lane: 0 },
    ])
  })

  it('в дневном виде показывает только задевающие этот день', () => {
    const events = [whole('a', '2026-09-01', '2026-09-04'), whole('b', '2026-09-05', '2026-09-06')]

    expect(band(placeAllDay(events, ['2026-09-02']))).toEqual([
      { id: 'a', index: 0, span: 1, lane: 0 },
    ])
  })
})

/** Срок задаётся московскими стенными часами: тем же боком он и показан на карточке. */
function due(id: string, wall: string): DueItem {
  return { id, dueAt: moment(wall) }
}

function stripes(placed: ReturnType<typeof placeDues<DueItem>>) {
  return placed.map((one) => ({ id: one.due.id, index: one.index, lane: one.lane }))
}

describe('placeDues', () => {
  it('кладёт срок в день своих московских часов, а не UTC', () => {
    // 2026-09-03 00:30 по Москве — это ещё 2 сентября по UTC
    const week = daysOf('week', DAY)

    expect(stripes(placeDues([due('a', '2026-09-03 00:30')], week))).toEqual([
      { id: 'a', index: 3, lane: 0 },
    ])
  })

  it('срок без времени лежит в своём дне, а не в предыдущем', () => {
    expect(stripes(placeDues([due('a', '2026-10-01 00:00')], daysOf('week', '2026-10-01')))).toEqual(
      [{ id: 'a', index: 3, lane: 0 }],
    )
  })

  it('сроки одного дня становятся друг под другом входным порядком', () => {
    const dues = [due('a', '09:00'), due('b', '18:00'), due('c', '2026-09-03 09:00')]

    expect(stripes(placeDues(dues, daysOf('week', DAY)))).toEqual([
      { id: 'a', index: 2, lane: 0 },
      { id: 'b', index: 2, lane: 1 },
      { id: 'c', index: 3, lane: 0 },
    ])
  })

  it('срок вне окна не показывается', () => {
    expect(placeDues([due('a', '2026-09-03 09:00')], [DAY])).toEqual([])
  })
})
