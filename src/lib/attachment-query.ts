import type { AttachmentView } from '@/server/services/attachments'
import { getJson } from './api-client'
import { cardKey } from './card-query'

/** Подключ карточки: гашение корня `cardsKey` перечитывает и вложения. */
export const attachmentsKey = (cardId: string) => [...cardKey(cardId), 'attachments'] as const

export function attachmentsQuery(cardId: string) {
  return {
    queryKey: attachmentsKey(cardId),
    queryFn: (): Promise<AttachmentView[]> =>
      getJson<AttachmentView[]>(`/api/cards/${cardId}/attachments`),
  }
}
