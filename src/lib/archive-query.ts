import { getJson } from './api-client'
import type { ArchiveView } from './archive-view'

export const archiveKey = (boardId: string) => ['archive', boardId] as const

export function archiveQuery(boardId: string) {
  return {
    queryKey: archiveKey(boardId),
    queryFn: (): Promise<ArchiveView> => getJson<ArchiveView>(`/api/boards/${boardId}/archive`),
  }
}
