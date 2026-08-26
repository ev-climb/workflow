import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, jsonBody } from '@/lib/http'
import { setBoardSlot, setSplitRatio } from '@/server/services/workspace'

const patch = z.union(
  [
    z.object({ slot: z.enum(['top', 'bottom']), boardId: z.uuid().nullable() }),
    z.object({ topBoardRatio: z.number() }),
  ],
  { error: 'ожидается либо {slot, boardId}, либо {topBoardRatio}' },
)

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request) {
  try {
    const body = await jsonBody(request, patch)
    const state =
      'slot' in body
        ? await setBoardSlot(body.slot, body.boardId)
        : await setSplitRatio(body.topBoardRatio)

    return NextResponse.json(state)
  } catch (error) {
    return errorResponse(error)
  }
}
