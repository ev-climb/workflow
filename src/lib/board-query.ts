import { getJson } from './api-client'
import type { BoardView } from './board-view'

export const boardKey = (boardId: string) => ['board', boardId] as const

export function boardQuery(boardId: string) {
  return {
    queryKey: boardKey(boardId),
    queryFn: (): Promise<BoardView> => getJson<BoardView>(`/api/boards/${boardId}`),
  }
}
