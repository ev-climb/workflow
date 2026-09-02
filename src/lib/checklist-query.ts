import type { ChecklistView } from '@/server/services/checklists'
import { getJson } from './api-client'
import { cardKey } from './card-query'

/** Подключ карточки: гашение корня `cardsKey` перечитывает и чек-листы. */
export const checklistsKey = (cardId: string) => [...cardKey(cardId), 'checklists'] as const

export function checklistsQuery(cardId: string) {
  return {
    queryKey: checklistsKey(cardId),
    queryFn: (): Promise<ChecklistView[]> =>
      getJson<ChecklistView[]>(`/api/cards/${cardId}/checklists`),
  }
}
