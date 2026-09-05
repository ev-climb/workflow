import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, notePatchBody, uuidParam } from '@/lib/http'
import { archiveNote, deleteNote, getNote, restoreNote, updateNote } from '@/server/services/notes'

type Params = { params: Promise<{ noteId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { noteId } = await params

  try {
    return NextResponse.json(await getNote(uuidParam(noteId, 'заметки')))
  } catch (error) {
    return errorResponse(error)
  }
}

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: Params) {
  const { noteId } = await params

  try {
    const id = uuidParam(noteId, 'заметки')
    const body = await jsonBody(request, notePatchBody)

    if ('archived' in body) {
      return NextResponse.json(body.archived ? await archiveNote(id) : await restoreNote(id))
    }
    return NextResponse.json(await updateNote(id, body))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { noteId } = await params

  try {
    return NextResponse.json(await deleteNote(uuidParam(noteId, 'заметки')))
  } catch (error) {
    return errorResponse(error)
  }
}
