import { NextResponse } from 'next/server'
import { toArchiveView } from '@/lib/archive-view'
import { errorResponse, uuidParam } from '@/lib/http'
import { getArchive } from '@/server/services/boards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(_request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params

  try {
    return NextResponse.json(toArchiveView(await getArchive(uuidParam(boardId, 'доски'))))
  } catch (error) {
    return errorResponse(error)
  }
}
