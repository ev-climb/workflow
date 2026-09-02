import { NextResponse } from 'next/server'
import { toEventTimes, toEventView } from '@/lib/calendar-view'
import { errorResponse, eventBody, jsonBody } from '@/lib/http'
import { createEvent, listEvents } from '@/server/services/google-events'

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

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request, eventBody)
    const created = await createEvent(body.calendarId, {
      title: body.title,
      times: toEventTimes(body.times),
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
