import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, transferBody, uuidParam } from '@/lib/http'
import { moveCardToBoard, previewBoardMove } from '@/server/services/cards'

type Params = { params: Promise<{ cardId: string }> }

/** Что снимется при переносе. Диалог спрашивает это до подтверждения — ADR-005. */
export async function GET(request: Request, { params }: Params) {
  const { cardId } = await params

  try {
    const listId = new URL(request.url).searchParams.get('listId') ?? ''
    return NextResponse.json(
      await previewBoardMove(uuidParam(cardId, 'карточки'), uuidParam(listId, 'списка')),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request, { params }: Params) {
  const { cardId } = await params

  try {
    const body = await jsonBody(request, transferBody)
    return NextResponse.json(
      await moveCardToBoard({ cardId: uuidParam(cardId, 'карточки'), listId: body.listId }),
    )
  } catch (error) {
    return errorResponse(error)
  }
}
