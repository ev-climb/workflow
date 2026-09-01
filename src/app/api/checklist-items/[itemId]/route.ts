import { NextResponse } from 'next/server'
import { checklistItemPatchBody, errorResponse, jsonBody, uuidParam } from '@/lib/http'
import {
  deleteChecklistItem,
  moveChecklistItem,
  updateChecklistItem,
} from '@/server/services/checklists'

type Params = { params: Promise<{ itemId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: Params) {
  const { itemId } = await params

  try {
    const body = await jsonBody(request, checklistItemPatchBody)
    const id = uuidParam(itemId, 'пункта')

    if ('checklistId' in body) {
      return NextResponse.json(await moveChecklistItem({ itemId: id, ...body }))
    }
    return NextResponse.json(await updateChecklistItem(id, body))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { itemId } = await params

  try {
    return NextResponse.json(await deleteChecklistItem(uuidParam(itemId, 'пункта')))
  } catch (error) {
    return errorResponse(error)
  }
}
