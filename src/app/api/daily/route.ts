import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http'
import { getDailyNote } from '@/server/services/notes'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get('day') ?? undefined

  try {
    return NextResponse.json(await getDailyNote(day))
  } catch (error) {
    return errorResponse(error)
  }
}
