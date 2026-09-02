import { NextResponse } from 'next/server'
import { calendarPatchBody, errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { updateGoogleCalendar } from '@/server/services/google-calendars'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ calendarId: string }> },
) {
  const { calendarId } = await params

  try {
    const body = await jsonBody(request, calendarPatchBody)
    return NextResponse.json(await updateGoogleCalendar(uuidParam(calendarId, 'календаря'), body))
  } catch (error) {
    return errorResponse(error)
  }
}
