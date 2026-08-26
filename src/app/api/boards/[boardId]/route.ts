import { NextResponse } from 'next/server'
import { z } from 'zod'
import { toBoardView } from '@/lib/board-view'
import { errorResponse } from '@/lib/http'
import { getBoard } from '@/server/services/boards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(_request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params
  if (!z.uuid().safeParse(boardId).success) {
    return NextResponse.json({ error: 'идентификатор доски не uuid' }, { status: 400 })
  }

  try {
    return NextResponse.json(toBoardView(await getBoard(boardId)))
  } catch (error) {
    return errorResponse(error)
  }
}
