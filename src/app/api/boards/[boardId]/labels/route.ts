import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, labelBody, uuidParam } from '@/lib/http'
import { createLabel } from '@/server/services/labels'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params

  try {
    const { name, color } = await jsonBody(request, labelBody)
    const created = await createLabel({ boardId: uuidParam(boardId, 'доски'), name, color })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
