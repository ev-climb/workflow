import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, noteItemPatchBody, uuidParam } from '@/lib/http'
import { deleteNoteItem, updateNoteItem } from '@/server/services/notes'

type Params = { params: Promise<{ itemId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: Params) {
  const { itemId } = await params

  try {
    const body = await jsonBody(request, noteItemPatchBody)
    return NextResponse.json(await updateNoteItem(uuidParam(itemId, 'пункта'), body))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { itemId } = await params

  try {
    return NextResponse.json(await deleteNoteItem(uuidParam(itemId, 'пункта')))
  } catch (error) {
    return errorResponse(error)
  }
}
