import { NextResponse } from 'next/server'
import { toCardView } from '@/lib/card-view'
import { cardPatchBody, errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { archiveCard, getCard, moveCard, renameCard, restoreCard } from '@/server/services/cards'

type Params = { params: Promise<{ cardId: string }> }

/** Карточка целиком для панели: в доске лежат только значки. */
export async function GET(_request: Request, { params }: Params) {
  const { cardId } = await params

  try {
    return NextResponse.json(toCardView(await getCard(uuidParam(cardId, 'карточки'))))
  } catch (error) {
    return errorResponse(error)
  }
}

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: Params) {
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
