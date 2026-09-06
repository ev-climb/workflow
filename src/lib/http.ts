import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleApiError } from '@/server/google/events'
import { TasksApiError } from '@/server/google/tasks'
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  ReauthRequiredError,
  UnauthorizedError,
} from '@/server/services/errors'

const CODES: [abstract new (...args: never[]) => Error, number][] = [
  [InvalidInputError, 400],
  [UnauthorizedError, 401],
  [ForbiddenError, 403],
  [NotFoundError, 404],
  [ConflictError, 409],
  // не 401: этим кодом отвечает негодная сессия приложения, а тут переподключить нужно
  // аккаунт Google — на форму входа такой ответ уводить не должен
  [ReauthRequiredError, 403],
]

/**
 * Сервис бросает типизированную ошибку, код выбирает обработчик маршрута — инвариант 2.
 * Чужая ошибка пробрасывается дальше: пятисотка с трассировкой честнее, чем ровный JSON,
 * который спрячет поломку.
 */
export function errorResponse(error: unknown): NextResponse {
  for (const [type, status] of CODES) {
    if (error instanceof type) return NextResponse.json({ error: error.message }, { status })
  }

  // права в Google могли отозвать между сверками списка календарей: своей поломки тут нет,
  // и пятисотка с английским текстом от Google объясняет хуже, чем одна русская строка
  if (error instanceof GoogleApiError && error.status === 403) {
    return NextResponse.json({ error: 'в этот календарь Google писать нельзя' }, { status: 403 })
  }

  // задачам своя ветка: доступ к Tasks отзывают отдельно от календаря, а `401` тут значит
  // не сессию, а токен без области `tasks`. Текст ошибки уже говорит, что чинить руками
  if (error instanceof TasksApiError && (error.status === 401 || error.status === 403)) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }

  throw error
}

/**
 * Редирект для браузера с относительным `Location`. Абсолютный адрес собрался бы из
 * имени, на котором слушает сервер, а не из того, по которому пришёл браузер: за портом
 * контейнера это увело бы на `0.0.0.0`.
 */
export function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location } })
}

/** База для разбора: своим считается путь, который к ней и приклеился. */
const OWN_ORIGIN = 'http://own.invalid'

/**
 * Путь для `seeOther`, пришедший запросом. Проверки на ведущий слэш мало: обратный слэш
 * браузер нормализует в прямой, и `/\evil.com` уходит в `Location` относительным путём,
 * а открывается чужим доменом. Разбор через `URL` сводит такое к чужому origin, а заодно
 * выбрасывает управляющие символы, которым в заголовке делать нечего.
 */
export function safeNext(value: string): string {
  if (!value.startsWith('/')) return '/'

  let url: URL
  try {
    url = new URL(value, OWN_ORIGIN)
  } catch {
    return '/'
  }

  if (url.origin !== OWN_ORIGIN) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}

/** Кривой JSON и несошедшаяся схема — такая же ошибка входа, как и всё остальное. */
export async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new InvalidInputError('тело запроса не разобралось как JSON')
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error))
  return parsed.data
}

export const isUuid = (value: string): boolean => z.uuid().safeParse(value).success

/** Кривой идентификатор — 400, а не пятисотка от базы на неверном формате uuid. */
export function uuidParam(value: string, what: string): string {
  if (!isUuid(value)) throw new InvalidInputError(`идентификатор ${what} не uuid`)
  return value
}

/** Схемы входа переехали в `schemas.ts` — маршруты по-прежнему берут их отсюда. */
export {
  accountPatchBody,
  calendarPatchBody,
  cardPatchBody,
  checklistItemPatchBody,
  eventBody,
  eventPatchBody,
  labelBody,
  labelPatchBody,
  noteBody,
  noteItemPatchBody,
  notePatchBody,
  noteToCardBody,
  patchBody,
  taskBody,
  taskPatchBody,
  timeBlockBody,
  timeBlockPatchBody,
  titleBody,
  transferBody,
} from './schemas.ts'
