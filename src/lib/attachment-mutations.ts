'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AttachmentView } from '@/server/services/attachments'
import { getJson, sendJson } from './api-client'
import { attachmentsKey } from './attachment-query'

/**
 * Доска после правки не перечитывается: на карточке в колонке от вложений ничего не
 * видно, а панель читает их своим подключом.
 */
function useAttachmentChange<T = void>(cardId: string, request: (input: T) => Promise<unknown>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: attachmentsKey(cardId) })
    },
  })
}

export const useAddAttachment = (cardId: string) =>
  useAttachmentChange(cardId, (file: File) => {
    const form = new FormData()
    form.append('file', file)
    // content-type не выставляем: границу multipart браузер знает только сам
    return getJson<AttachmentView>(`/api/cards/${cardId}/attachments`, {
      method: 'POST',
      body: form,
    })
  })

export const useDeleteAttachment = (cardId: string, attachmentId: string) =>
  useAttachmentChange(cardId, () => sendJson('DELETE', `/api/attachments/${attachmentId}`))
