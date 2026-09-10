import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http'
import { getDailyNote } from '@/server/services/notes'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET() {
  try {
    return NextResponse.json(await getDailyNote())
  } catch (error) {
    return errorResponse(error)
  }
}
