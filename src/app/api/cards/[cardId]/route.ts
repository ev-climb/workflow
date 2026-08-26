import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, titleBody, uuidParam } from '@/lib/http'
import { renameCard } from '@/server/services/cards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params

  try {
    const { title } = await jsonBody(request, titleBody)
    return NextResponse.json(await renameCard(uuidParam(cardId, 'карточки'), title))
  } catch (error) {
    return errorResponse(error)
  }
}
