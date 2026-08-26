import { Workspace } from '@/components/workspace/Workspace'
import { toBoardView, type BoardView } from '@/lib/board-view'
import { getBoard, listBoards } from '@/server/services/boards'
import { getWorkspaceState } from '@/server/services/workspace'

// состояние стола лежит в базе и меняется на каждый чих: прегенерация отдавала бы вчерашнее
export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const [state, boards] = await Promise.all([getWorkspaceState(), listBoards()])

  // доску слота могли заархивировать: тогда слот показывается пустым, а не роняет страницу
  const alive = new Set(boards.map((board) => board.id))
  const ids = [...new Set([state.topBoardId, state.bottomBoardId])].filter(
    (id): id is string => id !== null && alive.has(id),
  )

  const initialBoards: Record<string, BoardView> = Object.fromEntries(
    await Promise.all(ids.map(async (id) => [id, toBoardView(await getBoard(id))] as const)),
  )

  return (
    <Workspace
      boards={boards}
      initialBoards={initialBoards}
      topBoardId={state.topBoardId}
      bottomBoardId={state.bottomBoardId}
      topBoardRatio={state.topBoardRatio}
    />
  )
}
