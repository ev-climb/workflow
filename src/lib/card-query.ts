import { getJson } from './api-client'
import type { CardDetailView } from './card-view'

/** Корень ключа: по нему разом инвалидируются все прочитанные карточки. */
export const cardsKey = ['card'] as const

export const cardKey = (cardId: string) => [...cardsKey, cardId] as const

export function cardQuery(cardId: string) {
  return {
    queryKey: cardKey(cardId),
    queryFn: (): Promise<CardDetailView> => getJson<CardDetailView>(`/api/cards/${cardId}`),
  }
}
