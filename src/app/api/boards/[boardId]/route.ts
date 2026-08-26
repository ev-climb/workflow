import { NextResponse } from 'next/server'
import { toBoardView } from '@/lib/board-view'
import { errorResponse, uuidParam } from '@/lib/http'
import { getBoard } from '@/server/services/boards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(_request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params

  try {
    return NextResponse.json(toBoardView(await getBoard(uuidParam(boardId, 'доски'))))
  } catch (error) {
    return errorResponse(error)
  }
}
