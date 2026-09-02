import { describe, expect, it } from 'vitest'
import {
  NEW_EVENT_MINUTES,
  TIME_BLOCK_MINUTES,
  blockAt,
  moved,
  rangeOf,
  rangeTimes,
  resized,
  selection,
  snapMinutes,
  timeLabel,
} from './calendar-drag'

const DAY = '2026-09-02'
const NEXT = '2026-09-03'
const HEIGHT = 1056

// смещение Москвы в сентябре +03:00, поэтому в тесте оно записано прямо в момент
function moment(wall: string): string {
  const [date, time] = wall.includes(' ') ? wall.split(' ') : [DAY, wall]
  return `${date}T${time}:00+03:00`
}

describe('snapMinutes', () => {
  it('притягивает точку к четверти часа', () => {
    expect(snapMinutes(HEIGHT / 2, HEIGHT)).toBe(720)
    expect(snapMinutes((HEIGHT / 1440) * 731, HEIGHT)).toBe(735)
  })

  it('за сутки не выходит', () => {
    expect(snapMinutes(-40, HEIGHT)).toBe(0)
    expect(snapMinutes(HEIGHT + 40, HEIGHT)).toBe(1440)
  })
})

describe('selection', () => {
  it('считает протяжку вверх так же, как вниз', () => {
    expect(selection(DAY, 600, 540)).toEqual({ day: DAY, start: 540, end: 600 })
  })

  it('нажатие без протяжки даёт заготовку, а не событие нулевой длины', () => {
    expect(selection(DAY, 600, 600)).toEqual({ day: DAY, start: 600, end: 600 + NEW_EVENT_MINUTES })
  })

  it('заготовка в самом низу суток не вылезает за полночь', () => {
    expect(selection(DAY, 1440, 1440)).toEqual({ day: DAY, start: 1410, end: 1440 })
  })
})

describe('moved', () => {
  const base = { day: DAY, start: 600, end: 660 }

  it('двигает блок, сохраняя длину', () => {
    expect(moved(base, DAY, 45)).toEqual({ day: DAY, start: 645, end: 705 })
  })

  it('переносит блок на день колонки, под которой отпустили', () => {
    expect(moved(base, NEXT, 0)).toEqual({ day: NEXT, start: 600, end: 660 })
  })

  it('не выпускает блок за границы суток', () => {
    expect(moved(base, DAY, -700)).toEqual({ day: DAY, start: 0, end: 60 })
    expect(moved(base, DAY, 900)).toEqual({ day: DAY, start: 1380, end: 1440 })
  })
})

describe('resized', () => {
  const base = { day: DAY, start: 600, end: 660 }

  it('двигает край, за который потянули', () => {
    expect(resized(base, 'end', 750)).toEqual({ day: DAY, start: 600, end: 750 })
    expect(resized(base, 'start', 540)).toEqual({ day: DAY, start: 540, end: 660 })
  })

  it('не даёт краям сойтись и разойтись задом наперёд', () => {
    expect(resized(base, 'end', 300)).toEqual({ day: DAY, start: 600, end: 615 })
    expect(resized(base, 'start', 900)).toEqual({ day: DAY, start: 645, end: 660 })
  })
})

describe('rangeOf', () => {
  it('берёт границы события московскими часами', () => {
    expect(rangeOf({ startsAt: moment('09:00'), endsAt: moment('10:30') }, DAY)).toEqual({
      day: DAY,
      start: 540,
      end: 630,
    })
  })

  it('конец ровно в полночь принадлежит своему дню', () => {
    expect(rangeOf({ startsAt: moment('23:00'), endsAt: moment(`${NEXT} 00:00`) }, DAY)).toEqual({
      day: DAY,
      start: 1380,
      end: 1440,
    })
  })

  it('событие через полночь не отдаёт: кусок дня тащить нельзя', () => {
    expect(rangeOf({ startsAt: moment('23:00'), endsAt: moment(`${NEXT} 01:00`) }, DAY)).toBeNull()
  })

  it('чужой день не отдаёт', () => {
    expect(rangeOf({ startsAt: moment('09:00'), endsAt: moment('10:00') }, NEXT)).toBeNull()
  })
})

describe('rangeTimes', () => {
  it('переводит минуты сетки в моменты по московским стенным часам', () => {
    expect(rangeTimes({ day: DAY, start: 540, end: 630 })).toEqual({
      allDay: false,
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T07:30:00.000Z',
    })
  })

  it('нижнюю границу суток отдаёт полуночью следующего дня', () => {
    expect(rangeTimes({ day: DAY, start: 1380, end: 1440 }).endsAt).toBe('2026-09-02T21:00:00.000Z')
  })
})

describe('timeLabel', () => {
  it('показывает нижнюю границу суток как 24:00', () => {
    expect(timeLabel({ day: DAY, start: 1380, end: 1440 })).toBe('23:00 — 24:00')
  })
})

describe('blockAt', () => {
  it('заводит блок на час от минуты, куда бросили карточку', () => {
    expect(blockAt(DAY, 600)).toEqual({ day: DAY, start: 600, end: 600 + TIME_BLOCK_MINUTES })
  })

  it('у нижнего края суток блок поднимается, а не вылезает за полночь', () => {
    expect(blockAt(DAY, 1425)).toEqual({ day: DAY, start: 1440 - TIME_BLOCK_MINUTES, end: 1440 })
  })
})
