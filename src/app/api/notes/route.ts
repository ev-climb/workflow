import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, noteBody, uuidParam } from '@/lib/http'
import { createNote, listNotes } from '@/server/services/notes'

/**
 * Заметки шторки. `folder=none` — те, что не разложены по директориям; параметр не задан
 * вовсе — все живые сразу. Архив спрашивается отдельным флагом.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const folder = params.get('folder')

  try {
    return NextResponse.json(
      await listNotes({
        archived: params.get('archived') === '1',
        ...(folder === null
          ? {}
          : { folderId: folder === 'none' ? null : uuidParam(folder, 'директории') }),
      }),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request, noteBody)
    return NextResponse.json(await createNote(body), { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
