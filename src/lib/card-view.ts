import type { CardDetail } from '@/server/services/cards'

export type CardDetailView = Omit<CardDetail, 'dueAt'> & { dueAt: string | null }

/** После JSON дата становится строкой — тем же способом, что и в `toBoardView`. */
export function toCardView(card: CardDetail): CardDetailView {
  return { ...card, dueAt: card.dueAt?.toISOString() ?? null }
}
