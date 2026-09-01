import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, titleBody, uuidParam } from '@/lib/http'
import { deleteChecklist, renameChecklist } from '@/server/services/checklists'

type Params = { params: Promise<{ checklistId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: Params) {
  const { checklistId } = await params

  try {
    const { title } = await jsonBody(request, titleBody)
    return NextResponse.json(await renameChecklist(uuidParam(checklistId, 'чек-листа'), title))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { checklistId } = await params

  try {
    return NextResponse.json(await deleteChecklist(uuidParam(checklistId, 'чек-листа')))
  } catch (error) {
    return errorResponse(error)
  }
}
