import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, patchBody, uuidParam } from '@/lib/http'
import { archiveCard, renameCard, restoreCard } from '@/server/services/cards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params

  try {
    const body = await jsonBody(request, patchBody)
    const id = uuidParam(cardId, 'карточки')

    if ('title' in body) return NextResponse.json(await renameCard(id, body.title))
    return NextResponse.json(body.archived ? await archiveCard(id) : await restoreCard(id))
  } catch (error) {
    return errorResponse(error)
  }
}
