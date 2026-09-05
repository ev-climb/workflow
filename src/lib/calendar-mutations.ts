'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendJson } from './api-client'
import { calendarKey } from './calendar-query'
import type { EventWriteResult } from '@/server/services/google-events'
import type { TaskWriteResult } from '@/server/services/google-tasks'
import type { EventTimesInput } from './calendar-view'

/**
 * После записи сетка перечитывается вся, корнем ключа: событие могло уехать в соседнее
 * окно, а какие из них прочитаны — здесь неизвестно. Инвалидация возвращается наружу, а не
 * гасится: тогда `onSettled` наступает после перечитывания, и снятая заготовка не оставит
 * дырку на месте события, которое ещё не приехало.
 */
function useCalendarChange<TInput, TResult>(request: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => client.invalidateQueries({ queryKey: calendarKey }),
  })
}

export type NewEvent = {
  calendarId: string
  title: string
  description?: string
  times: EventTimesInput
}

export const useCreateEvent = () =>
  useCalendarChange((draft: NewEvent) => sendJson('POST', '/api/calendar/events', draft))

export const useSetEventTimes = () =>
  useCalendarChange(({ id, times }: { id: string; times: EventTimesInput }) =>
    sendJson('PATCH', `/api/calendar/events/${id}`, { times }),
  )

/** Правка события полями панели: уходит только то, что действительно правили. */
export type EventEdit = { title?: string; description?: string; times?: EventTimesInput }

export const useEditEvent = (id: string) =>
  useCalendarChange((changes: EventEdit) =>
    sendJson<EventWriteResult>('PATCH', `/api/calendar/events/${id}`, changes),
  )

/** Время под карточку: своего названия у блока нет, он показывает карточку. */
export type NewTimeBlock = { cardId: string; startsAt: string; endsAt: string }

export const useCreateTimeBlock = () =>
  useCalendarChange((block: NewTimeBlock) =>
    sendJson('POST', '/api/calendar/time-blocks', block),
  )

/**
 * Перенос и растягивание блока по сетке. Пара границ уходит целиком, как и у события:
 * промежуточного состояния у блока нет.
 */
export const useMoveTimeBlock = () =>
  useCalendarChange(({ id, startsAt, endsAt }: { id: string; startsAt: string; endsAt: string }) =>
    sendJson('PATCH', `/api/calendar/time-blocks/${id}`, { startsAt, endsAt }),
  )

/** Зеркало блока в Google: календарь показа либо `null` — убрать зеркало. */
export const useMirrorTimeBlock = (id: string) =>
  useCalendarChange((calendarId: string | null) =>
    sendJson('PATCH', `/api/calendar/time-blocks/${id}`, { calendarId }),
  )

export const useRemoveTimeBlock = () =>
  useCalendarChange((id: string) => sendJson('DELETE', `/api/calendar/time-blocks/${id}`))

export const useRemoveEvent = () =>
  useCalendarChange((id: string) => sendJson('DELETE', `/api/calendar/events/${id}`))

/** Новая задача: список, название и срок днём выделения. Времени у срока нет. */
export type NewTask = { taskListId: string; title: string; notes?: string; due: string }

export const useCreateTask = () =>
  useCalendarChange((draft: NewTask) => sendJson('POST', '/api/calendar/tasks', draft))

/** Правка задачи Google полями панели: уходит только то, что действительно правили. */
export type TaskEdit = {
  title?: string
  notes?: string
  due?: string | null
  completed?: boolean
}

export const useEditTask = (id: string) =>
  useCalendarChange((changes: TaskEdit) =>
    sendJson<TaskWriteResult>('PATCH', `/api/calendar/tasks/${id}`, changes),
  )

/** Перенос задачи по сетке: у задачи только день, времени в её сроке нет — инвариант 3. */
export const useSetTaskDue = () =>
  useCalendarChange(({ id, due }: { id: string; due: string }) =>
    sendJson<TaskWriteResult>('PATCH', `/api/calendar/tasks/${id}`, { due }),
  )

/**
 * Отметка выполнения с полосы. Тот же `PATCH`, что и из панели: чекбокс на сетке и
 * чекбокс в панели — два входа в одну запись.
 */
export const useSetTaskDone = () =>
  useCalendarChange(({ id, completed }: { id: string; completed: boolean }) =>
    sendJson<TaskWriteResult>('PATCH', `/api/calendar/tasks/${id}`, { completed }),
  )
