import type { LabelRef } from '@/server/services/cards'
import { getJson } from './api-client'

export type MovePreview = { droppedLabels: LabelRef[]; keptLabels: LabelRef[] }

export const transferPreviewKey = (cardId: string, listId: string) =>
  ['card-transfer', cardId, listId] as const

export function transferPreviewQuery(cardId: string, listId: string) {
  return {
    queryKey: transferPreviewKey(cardId, listId),
    queryFn: (): Promise<MovePreview> =>
      getJson<MovePreview>(`/api/cards/${cardId}/transfer?listId=${listId}`),
  }
}
