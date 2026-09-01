import { NextResponse } from 'next/server'
import { errorResponse, uuidParam } from '@/lib/http'
import { attachLabel, detachLabel } from '@/server/services/labels'

type Params = { params: Promise<{ cardId: string; labelId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PUT(_request: Request, { params }: Params) {
  const { cardId, labelId } = await params

  try {
    return NextResponse.json(
      await attachLabel(uuidParam(cardId, 'карточки'), uuidParam(labelId, 'метки')),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { cardId, labelId } = await params

  try {
    return NextResponse.json(
      await detachLabel(uuidParam(cardId, 'карточки'), uuidParam(labelId, 'метки')),
    )
  } catch (error) {
    return errorResponse(error)
  }
}
