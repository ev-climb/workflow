import type { BoardView } from './board-view'

export const boardKey = (boardId: string) => ['board', boardId] as const

export function boardQuery(boardId: string) {
  return {
    queryKey: boardKey(boardId),
    queryFn: async (): Promise<BoardView> => {
      const response = await fetch(`/api/boards/${boardId}`)
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `сервер ответил ${response.status}`)
      }
      return response.json() as Promise<BoardView>
    },
  }
}
