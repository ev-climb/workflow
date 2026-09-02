import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, timeBlockBody } from '@/lib/http'
import { createTimeBlock, listTimeBlocks } from '@/server/services/time-blocks'

export const dynamic = 'force-dynamic'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  try {
    const blocks = await listTimeBlocks(params.get('from') ?? '', params.get('to') ?? '')
    return NextResponse.json(
      blocks.map((block) => ({
        ...block,
        startsAt: block.startsAt.toISOString(),
        endsAt: block.endsAt.toISOString(),
      })),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request, timeBlockBody)
    const created = await createTimeBlock({
      cardId: body.cardId,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
