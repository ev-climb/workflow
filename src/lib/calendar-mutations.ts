'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendJson } from './api-client'
import { calendarKey } from './calendar-query'
import type { EventWriteResult } from '@/server/services/google-events'
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

export type NewEvent = { calendarId: string; title: string; times: EventTimesInput }

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

/** Зеркало блока в Google: календарь показа либо `null` — убрать зеркало. */
export const useMirrorTimeBlock = (id: string) =>
  useCalendarChange((calendarId: string | null) =>
    sendJson('PATCH', `/api/calendar/time-blocks/${id}`, { calendarId }),
  )

export const useRemoveTimeBlock = () =>
  useCalendarChange((id: string) => sendJson('DELETE', `/api/calendar/time-blocks/${id}`))

export const useRemoveEvent = () =>
  useCalendarChange((id: string) => sendJson('DELETE', `/api/calendar/events/${id}`))
