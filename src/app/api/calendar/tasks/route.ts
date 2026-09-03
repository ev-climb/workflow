import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http'
import { listTasks } from '@/server/services/google-tasks'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  try {
    return NextResponse.json(await listTasks(params.get('from') ?? '', params.get('to') ?? ''))
  } catch (error) {
    return errorResponse(error)
  }
}
