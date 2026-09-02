import { NextResponse } from 'next/server'
import { toEventView } from '@/lib/calendar-view'
import { errorResponse } from '@/lib/http'
import { listEvents } from '@/server/services/google-events'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  try {
    const events = await listEvents(params.get('from') ?? '', params.get('to') ?? '')
    return NextResponse.json(events.map(toEventView))
  } catch (error) {
    return errorResponse(error)
  }
}
