import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, timeBlockPatchBody, uuidParam } from '@/lib/http'
import {
  mirrorTimeBlock,
  moveTimeBlock,
  removeTimeBlock,
  unmirrorTimeBlock,
} from '@/server/services/time-blocks'

type Context = { params: Promise<{ timeBlockId: string }> }

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request, { params }: Context) {
  const { timeBlockId } = await params

  try {
    const body = await jsonBody(request, timeBlockPatchBody)
    const id = uuidParam(timeBlockId, 'тайм-блока')

    if ('calendarId' in body) {
      const changed = body.calendarId
        ? await mirrorTimeBlock(id, body.calendarId)
        : await unmirrorTimeBlock(id)
      return NextResponse.json(changed)
    }

    return NextResponse.json(
      await moveTimeBlock(id, { startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) }),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { timeBlockId } = await params

  try {
    return NextResponse.json(await removeTimeBlock(uuidParam(timeBlockId, 'тайм-блока')))
  } catch (error) {
    return errorResponse(error)
  }
}
