import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, titleBody, uuidParam } from '@/lib/http'
import { createChecklist, listChecklists } from '@/server/services/checklists'

type Params = { params: Promise<{ cardId: string }> }

/** Чек-листы карточки с пунктами: в доске от них только счётчик прогресса. */
export async function GET(_request: Request, { params }: Params) {
  const { cardId } = await params

  try {
    return NextResponse.json(await listChecklists(uuidParam(cardId, 'карточки')))
  } catch (error) {
    return errorResponse(error)
  }
}

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request, { params }: Params) {
  const { cardId } = await params

  try {
    const { title } = await jsonBody(request, titleBody)
    const created = await createChecklist({ cardId: uuidParam(cardId, 'карточки'), title })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
