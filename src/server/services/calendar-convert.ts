import { addDays } from '../../lib/calendar-grid.ts'
import { momentInMoscow, moscowParts } from '../../lib/dates.ts'
import { InvalidInputError } from './errors.ts'
import { createEvent, getEvent, removeEvent } from './google-events.ts'
import { createTask, getTask, removeTask, type TaskSlot } from './google-tasks.ts'

/**
 * Смена типа записи: событие календаря становится задачей Tasks и обратно. В Google это
 * разные продукты с разными ключами, поэтому перенос — создание на новой стороне и
 * удаление на старой, а не правка (ADR-015). Ссылки на прежнюю запись после этого
 * не работают, и история правок в Google остаётся у стёртого.
 *
 * Сначала создаём, потом стираем: оборванный на середине перенос оставит две записи,
 * а не ноль.
 */

/**
 * Событие → задача. День берётся из начала события; часы — если оно укладывается в одни
 * сутки, иначе задача получает один срок без времени. Событие на весь день временем и
 * не обзаводится.
 */
export async function eventToTask(
  eventId: string,
  taskListId: string,
): Promise<{ taskId: string }> {
  const event = await getEvent(eventId)
  if (event.taskId !== null) {
    throw new InvalidInputError('это зеркало задачи Google, а не событие: задачей оно уже является')
  }

  const created = await createTask(taskListId, {
    title: event.title,
    notes: event.description,
    ...dueOfEvent(event),
  })
  await removeEvent(eventId)

  return created
}

function dueOfEvent(event: {
  allDay: boolean
  startsAt: Date | null
  endsAt: Date | null
  startDate: string | null
}): { due: string | null; slot: TaskSlot } {
  // инвариант 3: дата события на весь день через часовой пояс не идёт
  if (event.allDay) return { due: event.startDate, slot: null }
  if (!event.startsAt || !event.endsAt) return { due: null, slot: null }

  const from = moscowParts(event.startsAt.toISOString())
  const to = moscowParts(event.endsAt.toISOString())
  // конец ровно в полночь — это конец того же дня: у задачи он записывается как 24:00
  const endTime = to.date === addDays(from.date, 1) && to.time === '00:00' ? '24:00' : to.time
  const sameDay = to.date === from.date || endTime === '24:00'

  return {
    due: from.date,
    slot: sameDay && endTime > from.time ? { startTime: from.time, endTime } : null,
  }
}

/**
 * Задача → событие. Часы задачи становятся временем события, а задача без времени —
 * событием на весь день: полоса сверху остаётся полосой.
 */
export async function taskToEvent(
  taskId: string,
  calendarId: string,
): Promise<{ eventId: string }> {
  const task = await getTask(taskId)

  const created = await createEvent(calendarId, {
    title: task.title,
    description: task.notes,
    times:
      task.startTime && task.endTime
        ? {
            allDay: false,
            startsAt: momentInMoscow(task.due, task.startTime),
            endsAt: momentInMoscow(task.due, task.endTime),
            startDate: null,
            endDate: null,
          }
        : {
            allDay: true,
            startDate: task.due,
            // граница у Google исключающая: сутки на весь день это следующая дата
            endDate: addDays(task.due, 1),
            startsAt: null,
            endsAt: null,
          },
  })
  await removeTask(taskId)

  return created
}
