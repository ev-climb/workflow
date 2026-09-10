import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { toEventBody } from '@/lib/schemas'
import { taskToEvent } from '@/server/services/calendar-convert'

type Context = { params: Promise<{ taskId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request, { params }: Context) {
  const { taskId } = await params

  try {
    const body = await jsonBody(request, toEventBody)
    const created = await taskToEvent(uuidParam(taskId, 'задачи'), body.calendarId)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
