import { NextResponse } from 'next/server'
import { cardPatchBody, errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { archiveCard, moveCard, renameCard, restoreCard } from '@/server/services/cards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params

  try {
    const body = await jsonBody(request, cardPatchBody)
    const id = uuidParam(cardId, 'карточки')

    if ('title' in body) return NextResponse.json(await renameCard(id, body.title))
    if ('listId' in body) return NextResponse.json(await moveCard({ cardId: id, ...body }))
    return NextResponse.json(body.archived ? await archiveCard(id) : await restoreCard(id))
  } catch (error) {
    return errorResponse(error)
  }
}
