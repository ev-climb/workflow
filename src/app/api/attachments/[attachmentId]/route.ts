import { NextResponse } from 'next/server'
import { errorResponse, uuidParam } from '@/lib/http'
import { deleteAttachment, openAttachment } from '@/server/services/attachments'

type Params = { params: Promise<{ attachmentId: string }> }

/**
 * Имя файла в заголовке — дважды: ascii-запаска и `filename*` по RFC 5987, иначе
 * кириллица приезжает крокозябрами. `encodeURIComponent` оставляет `'()*`, а они в
 * ext-value не разрешены.
 */
function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/** Отдача под сессией: до этого места без годной куки не доходят — см. `src/proxy.ts`. */
export async function GET(_request: Request, { params }: Params) {
  const { attachmentId } = await params

  try {
    const file = await openAttachment(uuidParam(attachmentId, 'вложения'))

    return new NextResponse(file.stream, {
      headers: {
        'content-type': file.mimeType,
        'content-length': String(file.sizeBytes),
        // вложение всегда скачивается, а не открывается на нашем домене: html с
        // мимо-типом `text/html` иначе выполнился бы рядом с кукой сессии
        'content-disposition': contentDisposition(file.name),
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { attachmentId } = await params

  try {
    return NextResponse.json(await deleteAttachment(uuidParam(attachmentId, 'вложения')))
  } catch (error) {
    return errorResponse(error)
  }
}
