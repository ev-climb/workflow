import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http'
import { dailyStats } from '@/server/services/daily'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET() {
  try {
    return NextResponse.json(await dailyStats())
  } catch (error) {
    return errorResponse(error)
  }
}
