import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, titleBody, uuidParam } from '@/lib/http'
import { addNoteItem } from '@/server/services/notes'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params

  try {
    const { title } = await jsonBody(request, titleBody)
    const created = await addNoteItem({ noteId: uuidParam(noteId, 'заметки'), title })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
