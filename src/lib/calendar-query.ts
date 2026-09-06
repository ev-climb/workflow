import type { GoogleCalendarSummary } from '@/server/services/google-calendars'
import type {
  CalendarTask,
  CalendarTaskDetails,
  TaskListSummary,
} from '@/server/services/google-tasks'
import { getJson } from './api-client'
import type {
  CalendarEventDetailsView,
  CalendarEventView,
  CardDueView,
  GoogleAccountView,
  TimeBlockView,
} from './calendar-view'

/** Корень ключа: по нему разом инвалидируются все прочитанные окна сетки. */
export const calendarKey = ['calendar'] as const

/**
 * Корень тайм-блоков, отдельный от сетки: блок показывает карточку, поэтому правка доски
 * гасит его, а события и задачи Google от правки доски не меняются.
 */
export const timeBlocksKey = ['calendar-blocks'] as const

/** Оба корня календаря: то, что гасится вместе, когда меняется весь календарь. */
export const calendarRoots = [calendarKey, timeBlocksKey] as const

export function calendarQuery(from: string, to: string) {
  return {
    queryKey: [...calendarKey, from, to] as const,
    queryFn: (): Promise<CalendarEventView[]> =>
      getJson<CalendarEventView[]>(`/api/calendar/events?from=${from}&to=${to}`),
  }
}

/**
 * Событие целиком, для панели правки: описание в сетку не ездит — у каждого приглашения
 * оно на несколько килобайт, а на блоке его всё равно не видно.
 *
 * Ключ растёт из того же корня, что и окна сетки: запись гасит разом и сетку, и панель.
 */
export function eventQuery(id: string) {
  return {
    queryKey: [...calendarKey, 'event', id] as const,
    queryFn: (): Promise<CalendarEventDetailsView> =>
      getJson<CalendarEventDetailsView>(`/api/calendar/events/${id}`),
  }
}

/**
 * Тайм-блоки растут из своего корня: их меняет и правка доски, которой события и задачи
 * Google не касаются. Что гасится вместе с сеткой, перечислено в `calendarRoots`.
 */
export function timeBlocksQuery(from: string, to: string) {
  return {
    queryKey: [...timeBlocksKey, from, to] as const,
    queryFn: (): Promise<TimeBlockView[]> =>
      getJson<TimeBlockView[]>(`/api/calendar/time-blocks?from=${from}&to=${to}`),
  }
}

/**
 * Задачи Google растут из корня сетки: их привозит та же синхронизация, что и события, и
 * тем же сигналом `calendar-changed` гасятся оба чтения разом.
 *
 * Своих типов для клиента у задачи нет: моментов в ней не бывает, а срок — строка с датой
 * по обе стороны JSON.
 */
export function tasksQuery(from: string, to: string) {
  return {
    queryKey: [...calendarKey, 'tasks', from, to] as const,
    queryFn: (): Promise<CalendarTask[]> =>
      getJson<CalendarTask[]>(`/api/calendar/tasks?from=${from}&to=${to}`),
  }
}

/** Задача целиком, для панели правки: заметки в сетку не ездят, на полосе их не видно. */
export function taskQuery(id: string) {
  return {
    queryKey: [...calendarKey, 'task', id] as const,
    queryFn: (): Promise<CalendarTaskDetails> =>
      getJson<CalendarTaskDetails>(`/api/calendar/tasks/${id}`),
  }
}

/**
 * Сроки читаются отдельно от событий: события меняет синхронизация с Google, сроки —
 * правка доски, и гасить чужой кэш на каждое из двух событий незачем.
 */
export const duesKey = ['calendar-dues'] as const

export function duesQuery(from: string, to: string) {
  return {
    queryKey: [...duesKey, from, to] as const,
    queryFn: (): Promise<CardDueView[]> =>
      getJson<CardDueView[]>(`/api/calendar/dues?from=${from}&to=${to}`),
  }
}

/** Календари для выбора при создании события. Читаются, когда диалог открывают. */
export const calendarsKey = ['google-calendars'] as const

export const calendarsQuery = {
  queryKey: calendarsKey,
  queryFn: (): Promise<GoogleCalendarSummary[]> =>
    getJson<GoogleCalendarSummary[]>('/api/google/calendars'),
}

/**
 * Куда вообще можно писать: только показанный и открытый на запись календарь. Зеркало в
 * спрятанном пропало бы с глаз сразу после включения, а в подписной вроде «Праздников
 * России» Google не даст завести событие.
 */
export function writableCalendars(
  calendars: GoogleCalendarSummary[] | undefined,
): GoogleCalendarSummary[] {
  return (calendars ?? []).filter((calendar) => calendar.visible && calendar.writable)
}

/** Подключённые аккаунты Google. Читаются, когда открывают настройки. */
export const accountsKey = ['google-accounts'] as const

export const accountsQuery = {
  queryKey: accountsKey,
  queryFn: (): Promise<GoogleAccountView[]> =>
    getJson<GoogleAccountView[]>('/api/google/accounts'),
}

/** Списки задач для выбора при создании задачи. Читаются, когда диалог открывают. */
const taskListsKey = ['google-task-lists'] as const

export const taskListsQuery = {
  queryKey: taskListsKey,
  queryFn: (): Promise<TaskListSummary[]> =>
    getJson<TaskListSummary[]>('/api/google/task-lists'),
}
