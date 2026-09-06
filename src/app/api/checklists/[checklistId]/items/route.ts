import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { titleBody } from '@/lib/schemas'
import { addChecklistItem } from '@/server/services/checklists'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ checklistId: string }> },
) {
  const { checklistId } = await params

  try {
    const { title } = await jsonBody(request, titleBody)
    const created = await addChecklistItem({
      checklistId: uuidParam(checklistId, 'чек-листа'),
      title,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
