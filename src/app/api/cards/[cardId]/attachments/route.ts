import { NextResponse } from 'next/server'
import { errorResponse, uuidParam } from '@/lib/http'
import {
  ATTACHMENT_MAX_BYTES,
  addAttachment,
  listAttachments,
} from '@/server/services/attachments'
import { InvalidInputError } from '@/server/services/errors'

type Params = { params: Promise<{ cardId: string }> }

/** Вложения карточки без содержимого: файлы качаются по отдельной ссылке. */
export async function GET(_request: Request, { params }: Params) {
  const { cardId } = await params

  try {
    return NextResponse.json(await listAttachments(uuidParam(cardId, 'карточки')))
  } catch (error) {
    return errorResponse(error)
  }
}

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function POST(request: Request, { params }: Params) {
  const { cardId } = await params

  try {
    // отсечка по объявленной длине до разбора: иначе `formData` сначала соберёт в память
    // весь присланный файл и только потом мы узнаем, что он не по размеру
    const declared = Number(request.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > ATTACHMENT_MAX_BYTES) {
      throw new InvalidInputError(`вложение: файл больше ${ATTACHMENT_MAX_BYTES} байт`)
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new InvalidInputError('тело запроса не разобралось как multipart/form-data')
    }

    const file = form.get('file')
    if (!(file instanceof File)) throw new InvalidInputError('ожидается поле file с файлом')

    const created = await addAttachment({
      cardId: uuidParam(cardId, 'карточки'),
      name: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
