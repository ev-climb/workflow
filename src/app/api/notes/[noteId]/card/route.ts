import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, noteToCardBody, uuidParam } from '@/lib/http'
import { noteToCard } from '@/server/services/notes'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params

  try {
    const body = await jsonBody(request, noteToCardBody)
    const created = await noteToCard({ noteId: uuidParam(noteId, 'заметки'), ...body })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
