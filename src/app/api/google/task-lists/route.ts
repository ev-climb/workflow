import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http'
import { listTaskLists } from '@/server/services/google-tasks'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET() {
  try {
    return NextResponse.json(await listTaskLists())
  } catch (error) {
    return errorResponse(error)
  }
}
