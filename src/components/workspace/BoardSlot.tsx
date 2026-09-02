'use client'

import Link from 'next/link'
import { Board } from '@/components/board/Board'
import { BoardLabels } from '@/components/board/BoardLabels'
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
      <header className="flex shrink-0 items-center gap-4 px-6 pt-4 pb-3.5">
        <BoardPicker boards={boards} boardId={boardId} label={LABEL[slot]} onChoose={onChoose} />
        {boardId ? (
          <div className="flex shrink-0 gap-1">
            <BoardLabels boardId={boardId} />
            <Link
              href={`/boards/${boardId}/archive`}
              className="btn-quiet px-2.5 py-1 text-xs focus-visible:ring-1 focus-visible:ring-accent-line"
            >
              Архив
            </Link>
          </div>
        ) : null}
        {/* линия добирает строку до края: шапка читается как заголовок раздела, а не как панель */}
        <div className="h-px min-w-0 flex-1 bg-linear-to-r from-white/10 to-transparent" />
      </header>
      {/* колонки доски прокручиваются здесь: страница целиком не ездит ни вбок, ни вниз */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6 pb-5">
        {boardId ? (
          <Board boards={boards} boardId={boardId} slot={slot} initial={initial} />
        ) : (
          <p className="px-1 text-sm text-fog-dim">Слот пуст: доска не выбрана.</p>
        )}
      </div>
    </section>
  )
}
