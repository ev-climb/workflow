'use client'

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
      </header>
      {/* колонки доски прокручиваются здесь: страница целиком не ездит ни вбок, ни вниз */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-2 pb-2">
        {boardId ? (
          <Board boardId={boardId} initial={initial} />
        ) : (
          <p className="px-1 text-sm text-neutral-500">Слот пуст: доска не выбрана.</p>
        )}
      </div>
    </section>
  )
}
