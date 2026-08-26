import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, titleBody, uuidParam } from '@/lib/http'
import { renameList } from '@/server/services/boards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params

  try {
    const { title } = await jsonBody(request, titleBody)
    return NextResponse.json(await renameList(uuidParam(listId, 'списка'), title))
  } catch (error) {
    return errorResponse(error)
  }
}
