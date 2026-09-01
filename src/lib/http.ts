import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ConflictError,
  InvalidInputError,
  NotFoundError,
  UnauthorizedError,
} from '@/server/services/errors'

const CODES: [abstract new (...args: never[]) => Error, number][] = [
  [InvalidInputError, 400],
  [UnauthorizedError, 401],
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
  throw error
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

/** Заголовок сервис сам обрежет и проверит: схема следит только за формой запроса. */
export const titleBody = z.object({ title: z.string() })

/** Правка списка или карточки: переименование либо переезд в архив и обратно. */
export const patchBody = z.union([titleBody, z.object({ archived: z.boolean() })], {
  error: 'ожидается либо {title}, либо {archived}',
})
