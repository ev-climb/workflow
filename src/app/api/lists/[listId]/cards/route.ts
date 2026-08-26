import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, titleBody, uuidParam } from '@/lib/http'
import { createCard } from '@/server/services/cards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request, { params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params

  try {
    const { title } = await jsonBody(request, titleBody)
    const created = await createCard({ listId: uuidParam(listId, 'списка'), title })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
