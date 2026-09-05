import { ReauthBanner } from '@/components/workspace/ReauthBanner'
import { Workspace } from '@/components/workspace/Workspace'
import { toBoardView, type BoardView } from '@/lib/board-view'
import { moscowToday } from '@/lib/calendar-grid'
import { isUuid } from '@/lib/http'
import { getBoard, listBoards } from '@/server/services/boards'
import { findCardBoard } from '@/server/services/cards'
import { listAccountsNeedingReauth } from '@/server/services/google-accounts'
import { getWorkspaceState } from '@/server/services/workspace'

// состояние стола лежит в базе и меняется на каждый чих: прегенерация отдавала бы вчерашнее
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function WorkspacePage({ searchParams }: Props) {
  const { card } = await searchParams
  const cardId = typeof card === 'string' && isUuid(card) ? card : null

  const [state, boards, cardBoardId, stale] = await Promise.all([
    getWorkspaceState(),
    listBoards(),
    cardId === null ? null : findCardBoard(cardId),
    listAccountsNeedingReauth(),
  ])

  // доску слота могли заархивировать: тогда слот показывается пустым, а не роняет страницу
  const alive = new Set(boards.map((board) => board.id))

  /**
   * Ссылка на карточку показывает её доску сверху, если ни в одном слоте её нет: иначе
   * ссылка открывала бы стол, на котором карточки не видно. Выбор слотов при этом не
   * переписывается — стол вернётся к своему виду, как только адрес станет обычным.
   */
  const linked =
    cardBoardId !== null &&
    alive.has(cardBoardId) &&
    cardBoardId !== state.topBoardId &&
    cardBoardId !== state.bottomBoardId
  const topBoardId = linked ? cardBoardId : state.topBoardId

  const ids = [...new Set([topBoardId, state.bottomBoardId])].filter(
    (id): id is string => id !== null && alive.has(id),
  )

  const initialBoards: Record<string, BoardView> = Object.fromEntries(
    await Promise.all(ids.map(async (id) => [id, toBoardView(await getBoard(id))] as const)),
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ReauthBanner accounts={stale} />
      <Workspace
        boards={boards}
        initialBoards={initialBoards}
        topBoardId={topBoardId}
        bottomBoardId={state.bottomBoardId}
        topBoardRatio={state.topBoardRatio}
        calendarMode={state.calendarMode}
        notesOpen={state.notesOpen}
        noteDropArchives={state.noteDropArchives}
        today={moscowToday()}
      />
    </div>
  )
}
