import { NextResponse } from 'next/server'
import { errorResponse, jsonBody } from '@/lib/http'
import { titleBody } from '@/lib/schemas'
import { createBoard } from '@/server/services/boards'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request) {
  try {
    const { title } = await jsonBody(request, titleBody)
    return NextResponse.json(await createBoard({ title }), { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
