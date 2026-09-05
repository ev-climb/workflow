import { NextResponse } from 'next/server'
import { toAccountView } from '@/lib/calendar-view'
import { errorResponse } from '@/lib/http'
import { listGoogleAccounts } from '@/server/services/google-accounts'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET() {
  try {
    return NextResponse.json((await listGoogleAccounts()).map(toAccountView))
  } catch (error) {
    return errorResponse(error)
  }
}
