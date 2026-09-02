import { NextResponse } from 'next/server'
import { toEventDetailsView, toEventTimes } from '@/lib/calendar-view'
import { errorResponse, eventPatchBody, jsonBody, uuidParam } from '@/lib/http'
import { getEvent, removeEvent, updateEvent } from '@/server/services/google-events'
import type { EventChanges } from '@/server/services/google-events'

type Context = { params: Promise<{ eventId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(_request: Request, { params }: Context) {
  const { eventId } = await params

  try {
    const event = await getEvent(uuidParam(eventId, 'события'))
    return NextResponse.json(toEventDetailsView(event))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const { eventId } = await params

  try {
    const body = await jsonBody(request, eventPatchBody)

    const changes: EventChanges = {}
    if (body.title !== undefined) changes.title = body.title
    if (body.description !== undefined) changes.description = body.description
    if (body.times) changes.times = toEventTimes(body.times)

    return NextResponse.json(await updateEvent(uuidParam(eventId, 'события'), changes))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { eventId } = await params

  try {
    return NextResponse.json(await removeEvent(uuidParam(eventId, 'события')))
  } catch (error) {
    return errorResponse(error)
  }
}
