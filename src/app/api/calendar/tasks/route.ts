import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, taskBody } from '@/lib/http'
import { createTask, listTasks } from '@/server/services/google-tasks'

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

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request, taskBody)
    const created = await createTask(body.taskListId, { title: body.title, due: body.due })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
