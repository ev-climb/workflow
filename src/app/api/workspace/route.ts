import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/http'
import { setBoardSlot, setSplitRatio } from '@/server/services/workspace'

const patch = z.union(
  [
    z.object({ slot: z.enum(['top', 'bottom']), boardId: z.uuid().nullable() }),
    z.object({ topBoardRatio: z.number() }),
  ],
  { error: 'ожидается либо {slot, boardId}, либо {topBoardRatio}' },
)

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'тело запроса не разобралось как JSON' }, { status: 400 })
  }

  const parsed = patch.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }

  try {
    const state =
      'slot' in parsed.data
        ? await setBoardSlot(parsed.data.slot, parsed.data.boardId)
        : await setSplitRatio(parsed.data.topBoardRatio)

    return NextResponse.json(state)
  } catch (error) {
    return errorResponse(error)
  }
}
