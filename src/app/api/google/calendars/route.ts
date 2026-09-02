import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http'
import { listGoogleCalendars } from '@/server/services/google-calendars'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET() {
  try {
    return NextResponse.json(await listGoogleCalendars())
  } catch (error) {
    return errorResponse(error)
  }
}
