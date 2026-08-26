import { Workspace } from '@/components/workspace/Workspace'
import { listBoards } from '@/server/services/boards'
import { getWorkspaceState } from '@/server/services/workspace'

// состояние стола лежит в базе и меняется на каждый чих: прегенерация отдавала бы вчерашнее
export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const [state, boards] = await Promise.all([getWorkspaceState(), listBoards()])

  return (
    <Workspace
      boards={boards}
      topBoardId={state.topBoardId}
      bottomBoardId={state.bottomBoardId}
      topBoardRatio={state.topBoardRatio}
    />
  )
}
