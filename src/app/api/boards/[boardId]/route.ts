import { NextResponse } from 'next/server'
import { toBoardView } from '@/lib/board-view'
import { errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { boardPatchBody } from '@/lib/schemas'
import { archiveBoard, getBoard, setBoardColor } from '@/server/services/boards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(_request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params

  try {
    return NextResponse.json(toBoardView(await getBoard(uuidParam(boardId, 'доски'))))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params

  try {
    const body = await jsonBody(request, boardPatchBody)
    const id = uuidParam(boardId, 'доски')
    return NextResponse.json(
      'color' in body ? await setBoardColor(id, body.color) : await archiveBoard(id),
    )
  } catch (error) {
    return errorResponse(error)
  }
}
