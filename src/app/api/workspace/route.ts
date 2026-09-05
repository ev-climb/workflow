import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, jsonBody } from '@/lib/http'
import {
  setBoardSlot,
  setCalendarMode,
  setNoteDropArchives,
  setNotesOpen,
  setSplitRatio,
} from '@/server/services/workspace'

const patch = z.union(
  [
    z.object({ slot: z.enum(['top', 'bottom']), boardId: z.uuid().nullable() }),
    z.object({ topBoardRatio: z.number() }),
    z.object({ calendarMode: z.string() }),
    z.object({ notesOpen: z.boolean() }),
    z.object({ noteDropArchives: z.boolean() }),
  ],
  {
    error:
      'ожидается {slot, boardId}, {topBoardRatio}, {calendarMode}, {notesOpen} или {noteDropArchives}',
  },
)

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(request: Request) {
  try {
    const body = await jsonBody(request, patch)
    let state
    if ('slot' in body) state = await setBoardSlot(body.slot, body.boardId)
    else if ('topBoardRatio' in body) state = await setSplitRatio(body.topBoardRatio)
    else if ('calendarMode' in body) state = await setCalendarMode(body.calendarMode)
    else if ('notesOpen' in body) state = await setNotesOpen(body.notesOpen)
    else state = await setNoteDropArchives(body.noteDropArchives)

    return NextResponse.json(state)
  } catch (error) {
    return errorResponse(error)
  }
}
