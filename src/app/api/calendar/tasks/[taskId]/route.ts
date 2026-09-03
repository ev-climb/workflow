import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, taskPatchBody, uuidParam } from '@/lib/http'
import { getTask, updateTask } from '@/server/services/google-tasks'
import type { TaskChanges } from '@/server/services/google-tasks'

type Context = { params: Promise<{ taskId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(_request: Request, { params }: Context) {
  const { taskId } = await params

  try {
    return NextResponse.json(await getTask(uuidParam(taskId, 'задачи')))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const { taskId } = await params

  try {
    const body = await jsonBody(request, taskPatchBody)

    const changes: TaskChanges = {}
    if (body.title !== undefined) changes.title = body.title
    if (body.notes !== undefined) changes.notes = body.notes
    if (body.due !== undefined) changes.due = body.due
    if (body.completed !== undefined) changes.completed = body.completed

    return NextResponse.json(await updateTask(uuidParam(taskId, 'задачи'), changes))
  } catch (error) {
    return errorResponse(error)
  }
}
