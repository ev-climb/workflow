import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, titleBody, uuidParam } from '@/lib/http'
import { deleteFolder, renameFolder } from '@/server/services/notes'

type Params = { params: Promise<{ folderId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: Params) {
  const { folderId } = await params

  try {
    const { title } = await jsonBody(request, titleBody)
    return NextResponse.json(await renameFolder(uuidParam(folderId, 'директории'), title))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { folderId } = await params

  try {
    return NextResponse.json(await deleteFolder(uuidParam(folderId, 'директории')))
  } catch (error) {
    return errorResponse(error)
  }
}
