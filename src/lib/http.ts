import { NextResponse } from 'next/server'
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
