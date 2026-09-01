import type { Archive } from '@/server/services/boards'

export type ArchivedListView = Omit<Archive['lists'][number], 'archivedAt'> & {
  archivedAt: string
}
export type ArchivedCardView = Omit<Archive['cards'][number], 'archivedAt'> & {
  archivedAt: string
}
export type ArchiveView = { lists: ArchivedListView[]; cards: ArchivedCardView[] }

/** Вид архива для клиента: после JSON даты становятся строками — как и в `toBoardView`. */
export function toArchiveView(archive: Archive): ArchiveView {
  const moment = <T extends { archivedAt: Date }>(item: T) => ({
    ...item,
    archivedAt: item.archivedAt.toISOString(),
  })

  return { lists: archive.lists.map(moment), cards: archive.cards.map(moment) }
}
