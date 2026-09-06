import { describe, expect, it } from 'vitest'
import type { CalendarTask } from '@/server/services/google-tasks'
import type { Target } from './calendar-drag'
import { buildScene, type AllDayView, type StripeDrag } from './calendar-scene'
import type { CalendarEventView, CardDueView, TimeBlockView } from './calendar-view'

const DAYS = ['2026-09-02', '2026-09-03', '2026-09-04']

// смещение Москвы в сентябре +03:00, поэтому в тесте оно записано прямо в момент
const moment = (day: string, time: string) => `${day}T${time}:00+03:00`

const EVENT: CalendarEventView = {
  id: 'e1',
  calendarId: 'cal',
  color: '#7986cb',
  title: 'Созвон',
  allDay: false,
  startsAt: moment(DAYS[0], '09:00'),
  endsAt: moment(DAYS[0], '10:00'),
  startDate: null,
  endDate: null,
  recurringEventId: null,
  taskId: null,
  taskCompleted: null,
}

function timed(patch: Partial<CalendarEventView> = {}): CalendarEventView {
  return { ...EVENT, ...patch }
}

function allDay(id: string, startDate: string, endDate: string): AllDayView {
  return { ...EVENT, id, allDay: true, startsAt: null, endsAt: null, startDate, endDate }
}

function block(id: string, from: string, to: string, day = DAYS[0]): TimeBlockView {
  return {
    id,
    cardId: `card-${id}`,
    cardTitle: 'Починить пуши',
    boardId: 'b1',
    boardTitle: 'Работа',
    startsAt: moment(day, from),
    endsAt: moment(day, to),
    cardDone: false,
    calendarId: null,
  }
}

function due(id: string, day: string): CardDueView {
  return {
    id,
    title: 'Отдать отчёт',
    dueAt: moment(day, '18:00'),
    dueHasTime: true,
    dueDone: false,
    boardId: 'b1',
    boardTitle: 'Работа',
  }
}

function task(id: string, day: string): CalendarTask {
  return { id, color: '#33b679', title: 'Купить билеты', due: day, completed: false }
}

function scene(input: {
  events?: CalendarEventView[]
  blocks?: TimeBlockView[]
  dues?: CardDueView[]
  tasks?: CalendarTask[]
  held?: Target | null
  heldStripe?: StripeDrag | null
}) {
  return buildScene({
    days: DAYS,
    events: input.events ?? [],
    blocks: input.blocks ?? [],
    dues: input.dues ?? [],
    tasks: input.tasks ?? [],
    held: input.held ?? null,
    heldStripe: input.heldStripe ?? null,
  })
}

describe('buildScene', () => {
  it('раскладывает событие и блок одним проходом: ширину они делят между собой', () => {
    const built = scene({
      events: [timed()],
      blocks: [block('b', '09:30', '10:30')],
    })

    expect(built.items.map((one) => one.id)).toEqual(['e1', 'block:b'])
  })

  it('разводит события на весь день и события со временем по разным рядам', () => {
    const built = scene({
      events: [timed(), allDay('a1', DAYS[0], DAYS[1])],
    })

    expect(built.items.map((one) => one.id)).toEqual(['e1'])
    expect(built.allDay.map((one) => one.event.id)).toEqual(['a1'])
  })

  it('снимает с прежнего места то, что тащат, и отдаёт его отдельно', () => {
    const held = scene({
      events: [timed()],
      blocks: [block('b', '12:00', '13:00')],
      held: { type: 'event', id: 'e1' },
    })

    expect(held.items.map((one) => one.id)).toEqual(['block:b'])
    expect(held.heldEvent?.id).toBe('e1')
    expect(held.heldBlock).toBeNull()

    const dragged = scene({
      events: [timed()],
      blocks: [block('b', '12:00', '13:00')],
      held: { type: 'block', id: 'b' },
    })

    expect(dragged.items.map((one) => one.id)).toEqual(['e1'])
    expect(dragged.heldBlock?.id).toBe('b')
  })

  it('раскладывает событие на весь день по дню под курсором, а не по записанному', () => {
    const event = allDay('a1', DAYS[0], DAYS[1])
    const built = scene({
      events: [event],
      heldStripe: { target: { kind: 'allday', event }, from: DAYS[0], day: DAYS[2] },
    })

    // сутки уехали на два дня вперёд: полоса встаёт в третью колонку, а не в первую
    expect(built.allDay[0].index).toBe(2)
  })

  it('переносит срок в день, где его держат, и не трогает соседнюю задачу', () => {
    const moved = scene({
      dues: [due('d1', DAYS[0])],
      tasks: [task('t1', DAYS[0])],
      heldStripe: {
        target: { kind: 'due', due: due('d1', DAYS[0]) },
        from: DAYS[0],
        day: DAYS[1],
      },
    })

    expect(moved.stripes.map((one) => [one.item.kind, one.index])).toEqual([
      ['due', 1],
      ['task', 0],
    ])
  })
})
