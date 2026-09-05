import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleApiError } from '@/server/google/events'
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnauthorizedError,
} from '@/server/services/errors'

const CODES: [abstract new (...args: never[]) => Error, number][] = [
  [InvalidInputError, 400],
  [UnauthorizedError, 401],
  [ForbiddenError, 403],
  [NotFoundError, 404],
  [ConflictError, 409],
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
