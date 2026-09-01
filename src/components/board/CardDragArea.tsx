'use client'

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useMoveCard } from '@/lib/board-mutations'
import { planMove, type DragData } from '@/lib/board-move'
import { boardKey } from '@/lib/board-query'
import type { BoardView, CardView } from '@/lib/board-view'
import { CARD_FRAME, CardFace } from './BoardCard'

const ACROSS_BOARDS =
  'Между досками карточка переносится через меню карточки: у досок разные метки, ' +
  'и перетаскивание сняло бы их молча.'

const NOTICE_MS = 6000

const dragData = (data: unknown): DragData | undefined => data as DragData | undefined

/**
 * Перетаскивание карточек на весь стол. Контекст один на обе доски, а не по одному на
 * доску: только так видно попытку перетащить карточку через границу — её отменяем
 * с подсказкой, а не молча (ADR-005).
 */
export function CardDragArea({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const move = useMoveCard()
  const [dragged, setDragged] = useState<CardView | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const reset = move.reset
  useEffect(() => {
    if (!hint && !move.error) return

    const timer = setTimeout(() => {
      setHint(null)
      reset()
    }, NOTICE_MS)
    return () => clearTimeout(timer)
  }, [hint, move.error, reset])

  const sensors = useSensors(
    // порог обязателен: без него карточку не ткнуть мышью и не переименовать двойным кликом
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function start({ active }: DragStartEvent) {
    const from = dragData(active.data.current)
    setHint(null)
    setDragged(from?.type === 'card' ? from.card : null)
  }

  /** Подсказка появляется, пока карточку ещё держат: отказ на отпускании — уже поздно. */
  function hover({ active, over }: DragOverEvent) {
    const from = dragData(active.data.current)
    const to = over ? dragData(over.data.current) : undefined
    if (from?.type !== 'card' || !to) return

    setHint(to.boardId === from.boardId ? null : ACROSS_BOARDS)
  }

  function end({ active, over }: DragEndEvent) {
    setDragged(null)

    const from = dragData(active.data.current)
    const to = over ? dragData(over.data.current) : undefined
    if (from?.type !== 'card' || !to) return

    if (to.boardId !== from.boardId) {
      setHint(ACROSS_BOARDS)
      return
    }

    const board = client.getQueryData<BoardView>(boardKey(from.boardId))
    if (!board) return

    const plan = planMove(board, from.card.id, to)
    if (plan) move.mutate({ boardId: from.boardId, cardId: from.card.id, ...plan })
  }

  const notice = hint ?? (move.error ? `Не сохранилось: ${move.error.message}` : null)

  return (
    <DndContext
      // без явного идентификатора dnd-kit нумерует контексты счётчиком модуля, и на сервере
      // номер выходит другой, чем на клиенте: гидратация расходится на aria-describedby
      id="card-drag"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={start}
      onDragOver={hover}
      onDragEnd={end}
      onDragCancel={() => setDragged(null)}
    >
      {children}

      {/* накладка живёт вне слотов: иначе её обрезала бы прокручиваемая область доски */}
      <DragOverlay>
        {dragged ? (
          <div
            className={`${CARD_FRAME} rotate-1 border-neutral-600 shadow-lg shadow-black/60`}
          >
            <CardFace
              card={dragged}
              title={<p className="text-sm leading-snug text-neutral-100">{dragged.title}</p>}
            />
          </div>
        ) : null}
      </DragOverlay>

      {notice ? (
        <p
          role="status"
          className={`absolute bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded border px-3 py-1.5 text-xs ${
            hint
              ? 'border-neutral-700 bg-neutral-900 text-neutral-300'
              : 'border-red-900 bg-red-950 text-red-200'
          }`}
        >
          {notice}
        </p>
      ) : null}
    </DndContext>
  )
}
