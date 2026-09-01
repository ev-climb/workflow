import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, patchBody, uuidParam } from '@/lib/http'
import { archiveList, renameList, restoreList } from '@/server/services/boards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params

  try {
    const body = await jsonBody(request, patchBody)
    const id = uuidParam(listId, 'списка')

    if ('title' in body) return NextResponse.json(await renameList(id, body.title))
    return NextResponse.json(body.archived ? await archiveList(id) : await restoreList(id))
  } catch (error) {
    return errorResponse(error)
  }
}
