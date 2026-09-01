'use client'

import Link from 'next/link'
import { Board } from '@/components/board/Board'
import type { BoardView } from '@/lib/board-view'
import type { BoardSummary } from '@/server/services/boards'
import type { Slot } from '@/server/services/workspace'
import { BoardPicker } from './BoardPicker'

const LABEL: Record<Slot, string> = { top: 'Верхняя доска', bottom: 'Нижняя доска' }

type Props = {
  slot: Slot
  boards: BoardSummary[]
  boardId: string | null
  initial?: BoardView
  onChoose: (boardId: string | null) => void
}

export function BoardSlot({ slot, boards, boardId, initial, onChoose }: Props) {
  return (
    <section data-slot={slot} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 px-2 py-1.5">
        <BoardPicker boards={boards} boardId={boardId} label={LABEL[slot]} onChoose={onChoose} />
        {boardId ? (
          <Link
            href={`/boards/${boardId}/archive`}
            className="rounded px-2 py-1 text-xs text-neutral-500 outline-none hover:bg-neutral-900 hover:text-neutral-300 focus-visible:ring-1 focus-visible:ring-neutral-600"
          >
            Архив
          </Link>
        ) : null}
      </header>
      {/* колонки доски прокручиваются здесь: страница целиком не ездит ни вбок, ни вниз */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-2 pb-2">
        {boardId ? (
          <Board boards={boards} boardId={boardId} slot={slot} initial={initial} />
        ) : (
          <p className="px-1 text-sm text-neutral-500">Слот пуст: доска не выбрана.</p>
        )}
      </div>
    </section>
  )
}
