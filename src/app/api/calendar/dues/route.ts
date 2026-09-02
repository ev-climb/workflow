import { NextResponse } from 'next/server'
import { toDueView } from '@/lib/calendar-view'
import { errorResponse } from '@/lib/http'
import { listDueCards } from '@/server/services/cards'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  try {
    const dues = await listDueCards(params.get('from') ?? '', params.get('to') ?? '')
    return NextResponse.json(dues.map(toDueView))
  } catch (error) {
    return errorResponse(error)
  }
}
