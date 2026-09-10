import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eventToTask, taskToEvent } from './calendar-convert.ts'
import { InvalidInputError } from './errors.ts'
import type { CalendarEventDetails } from './google-events.ts'
import type { CalendarTaskDetails } from './google-tasks.ts'

vi.mock('./google-events.ts', () => ({
  getEvent: vi.fn(),
  createEvent: vi.fn(),
  removeEvent: vi.fn(),
}))
vi.mock('./google-tasks.ts', () => ({
  getTask: vi.fn(),
  createTask: vi.fn(),
  removeTask: vi.fn(),
}))

const { getEvent, createEvent, removeEvent } = vi.mocked(await import('./google-events.ts'))
const { getTask, createTask, removeTask } = vi.mocked(await import('./google-tasks.ts'))

beforeEach(() => {
  vi.clearAllMocks()
  createTask.mockResolvedValue({ taskId: 'new-task' })
  createEvent.mockResolvedValue({ eventId: 'new-event' })
  removeEvent.mockResolvedValue({ eventId: 'e1' })
  removeTask.mockResolvedValue({ taskId: 't1' })
})

// смещение Москвы в сентябре +03:00, поэтому в тесте оно записано прямо в момент
const moment = (day: string, time: string) => new Date(`${day}T${time}:00+03:00`)

function event(patch: Partial<CalendarEventDetails> = {}): CalendarEventDetails {
  return {
    id: 'e1',
    calendarId: 'cal',
    color: '#7986cb',
    title: 'Созвон',
    allDay: false,
    startsAt: moment('2026-09-02', '15:00'),
    endsAt: moment('2026-09-02', '16:00'),
    startDate: null,
    endDate: null,
    recurringEventId: null,
    taskId: null,
    taskCompleted: null,
    description: 'повестка',
    calendarTitle: 'Личный',
    htmlLink: null,
    ...patch,
  }
}

function task(patch: Partial<CalendarTaskDetails> = {}): CalendarTaskDetails {
  return {
    id: 't1',
    color: '#33b679',
    title: 'Купить билеты',
    due: '2026-09-02',
    startTime: null,
    endTime: null,
    completed: false,
    notes: 'до пятницы',
    taskListTitle: 'Мои задачи',
    webViewLink: null,
    ...patch,
  }
}

describe('событие в задачу', () => {
  it('часы события становятся часами задачи, описание — заметками', async () => {
    getEvent.mockResolvedValue(event())

    expect(await eventToTask('e1', 'list')).toEqual({ taskId: 'new-task' })
    expect(createTask).toHaveBeenCalledWith('list', {
      title: 'Созвон',
      notes: 'повестка',
      due: '2026-09-02',
      slot: { startTime: '15:00', endTime: '16:00' },
    })
    expect(removeEvent).toHaveBeenCalledWith('e1')
  })

  it('событие на весь день даёт задачу без времени, и дата не уезжает на сутки', async () => {
    getEvent.mockResolvedValue(
      event({
        allDay: true,
        startsAt: null,
        endsAt: null,
        startDate: '2026-03-01',
        endDate: '2026-03-02',
      }),
    )

    await eventToTask('e1', 'list')

    expect(createTask).toHaveBeenCalledWith(
      'list',
      expect.objectContaining({ due: '2026-03-01', slot: null }),
    )
  })

  it('конец ровно в полночь остаётся в своём дне: 24:00, а не следующая дата', async () => {
    getEvent.mockResolvedValue(
      event({
        startsAt: moment('2026-09-02', '23:00'),
        endsAt: moment('2026-09-03', '00:00'),
      }),
    )

    await eventToTask('e1', 'list')

    expect(createTask).toHaveBeenCalledWith(
      'list',
      expect.objectContaining({
        due: '2026-09-02',
        slot: { startTime: '23:00', endTime: '24:00' },
      }),
    )
  })

  it('событие через сутки теряет часы: задача внутри одного дня', async () => {
    getEvent.mockResolvedValue(
      event({
        startsAt: moment('2026-09-02', '23:00'),
        endsAt: moment('2026-09-03', '01:00'),
      }),
    )

    await eventToTask('e1', 'list')

    expect(createTask).toHaveBeenCalledWith(
      'list',
      expect.objectContaining({ due: '2026-09-02', slot: null }),
    )
  })

  it('зеркало задачи задачей не делается: оно ею уже является', async () => {
    getEvent.mockResolvedValue(event({ taskId: 't1', taskCompleted: false }))

    await expect(eventToTask('e1', 'list')).rejects.toBeInstanceOf(InvalidInputError)
    expect(createTask).not.toHaveBeenCalled()
    expect(removeEvent).not.toHaveBeenCalled()
  })
})

describe('задача в событие', () => {
  it('часы задачи становятся временем события', async () => {
    getTask.mockResolvedValue(task({ startTime: '15:00', endTime: '16:00' }))

    expect(await taskToEvent('t1', 'cal')).toEqual({ eventId: 'new-event' })
    expect(createEvent).toHaveBeenCalledWith('cal', {
      title: 'Купить билеты',
      description: 'до пятницы',
      times: {
        allDay: false,
        startsAt: moment('2026-09-02', '15:00'),
        endsAt: moment('2026-09-02', '16:00'),
        startDate: null,
        endDate: null,
      },
    })
    expect(removeTask).toHaveBeenCalledWith('t1')
  })

  it('задача без часов становится событием на весь день, дата через пояс не идёт', async () => {
    getTask.mockResolvedValue(task({ due: '2026-03-01' }))

    await taskToEvent('t1', 'cal')

    expect(createEvent).toHaveBeenCalledWith(
      'cal',
      expect.objectContaining({
        times: {
          allDay: true,
          startDate: '2026-03-01',
          endDate: '2026-03-02',
          startsAt: null,
          endsAt: null,
        },
      }),
    )
  })

  it('сначала заводит, потом стирает: оборванный перенос оставит две записи', async () => {
    getTask.mockResolvedValue(task())
    createEvent.mockRejectedValue(new Error('Google отказал'))

    await expect(taskToEvent('t1', 'cal')).rejects.toThrow()
    expect(removeTask).not.toHaveBeenCalled()
  })
})
