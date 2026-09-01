import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BoardArchive } from '@/components/board/BoardArchive'
import { toArchiveView } from '@/lib/archive-view'
import { isUuid } from '@/lib/http'
import { getArchive, listBoards } from '@/server/services/boards'

export const dynamic = 'force-dynamic'

export default async function ArchivePage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params
  if (!isUuid(boardId)) notFound()

  const board = (await listBoards()).find((item) => item.id === boardId)
  if (!board) notFound()

  return (
    <main className="mx-auto flex h-screen w-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex shrink-0 items-baseline gap-3">
        <h1 className="text-base font-medium text-neutral-100">Архив доски «{board.title}»</h1>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← На стол
        </Link>
      </header>
      <BoardArchive boardId={boardId} initial={toArchiveView(await getArchive(boardId))} />
    </main>
  )
}
