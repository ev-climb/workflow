import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, labelPatchBody, uuidParam } from '@/lib/http'
import { deleteLabel, updateLabel } from '@/server/services/labels'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ labelId: string }> },
) {
  const { labelId } = await params

  try {
    const body = await jsonBody(request, labelPatchBody)
    return NextResponse.json(await updateLabel(uuidParam(labelId, 'метки'), body))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ labelId: string }> },
) {
  const { labelId } = await params

  try {
    return NextResponse.json(await deleteLabel(uuidParam(labelId, 'метки')))
  } catch (error) {
    return errorResponse(error)
  }
}
