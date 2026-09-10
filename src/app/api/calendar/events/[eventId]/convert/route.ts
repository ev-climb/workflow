import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { toTaskBody } from '@/lib/schemas'
import { eventToTask } from '@/server/services/calendar-convert'

type Context = { params: Promise<{ eventId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request, { params }: Context) {
  const { eventId } = await params

  try {
    const body = await jsonBody(request, toTaskBody)
    const created = await eventToTask(uuidParam(eventId, 'события'), body.taskListId)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
