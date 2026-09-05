import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, titleBody } from '@/lib/http'
import { createFolder, listFolders } from '@/server/services/notes'

export async function GET() {
  try {
    return NextResponse.json(await listFolders())
  } catch (error) {
    return errorResponse(error)
  }
}

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request) {
  try {
    const { title } = await jsonBody(request, titleBody)
    return NextResponse.json(await createFolder({ title }), { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
