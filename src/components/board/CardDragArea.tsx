'use client'

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useMoveCard, useMoveList } from '@/lib/board-mutations'
import { CALENDAR_DROP, isCalendarDrop } from '@/lib/calendar-drag'
import { planListMove, planMove, type DragData } from '@/lib/board-move'
import { boardKey } from '@/lib/board-query'
import type { BoardView } from '@/lib/board-view'
import { CARD_FRAME, CardFace } from './BoardCard'

const ACROSS_BOARDS =
  'Между досками карточка переносится через меню карточки: у досок разные метки, ' +
  'и перетаскивание сняло бы их молча.'

const LIST_ACROSS_BOARDS = 'Список переставляется только внутри своей доски.'

const across = (from: DragData) => (from.type === 'list' ? LIST_ACROSS_BOARDS : ACROSS_BOARDS)

const NOTICE_MS = 6000

const dragData = (data: unknown): DragData | undefined => data as DragData | undefined

/**
 * Сетка календаря выбирается курсором, всё остальное — по расстоянию до углов. Сетка
 * высокая и узкая: её углы далеко от точки броска, и `closestCorners` отдаёт её любой
 * колонке доски, оказавшейся рядом, — попадёт карточка в календарь или нет, решала бы
 * высота соседней колонки. Сортировке карточек углы по-прежнему подходят лучше курсора,
 * а списку на сетке делать нечего: тайм-блок заводится только карточкой.
 */
const collide: CollisionDetection = (args) => {
  if (dragData(args.active.data.current)?.type !== 'card') return closestCorners(args)

  const calendar = pointerWithin(args).find((one) => one.id === CALENDAR_DROP)
  return calendar ? [calendar] : closestCorners(args)
}

/**
 * Перетаскивание карточек и списков на весь стол. Контекст один на обе доски, а не по
 * одному на доску: только так видно попытку перетащить через границу — её отменяем
 * с подсказкой, а не молча (ADR-005).
 */
export function CardDragArea({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const move = useMoveCard()
  const moveList = useMoveList()
  const [dragged, setDragged] = useState<DragData | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const failed = move.error ?? moveList.error
  const resetCard = move.reset
  const resetList = moveList.reset
  useEffect(() => {
    if (!hint && !failed) return

    const timer = setTimeout(() => {
      setHint(null)
      resetCard()
      resetList()
    }, NOTICE_MS)
    return () => clearTimeout(timer)
  }, [hint, failed, resetCard, resetList])

  const sensors = useSensors(
    // порог обязателен: без него карточку не ткнуть мышью и не переименовать двойным кликом
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function start({ active }: DragStartEvent) {
    setHint(null)
    setDragged(dragData(active.data.current) ?? null)
  }

  /** Подсказка появляется, пока карточку ещё держат: отказ на отпускании — уже поздно. */
  function hover({ active, over }: DragOverEvent) {
    // сетка календаря — цель тайм-блока, а не доски: заготовку под курсором рисует она сама
    if (isCalendarDrop(over?.data.current)) {
      setHint(null)
      return
    }

    const from = dragData(active.data.current)
    const to = over ? dragData(over.data.current) : undefined
    if (!from || !to) return

    setHint(to.boardId === from.boardId ? null : across(from))
  }

  function end({ active, over }: DragEndEvent) {
    setDragged(null)
    if (isCalendarDrop(over?.data.current)) return

    const from = dragData(active.data.current)
    const to = over ? dragData(over.data.current) : undefined
    if (!from || !to) return

    if (to.boardId !== from.boardId) {
      setHint(across(from))
      return
    }

    const board = client.getQueryData<BoardView>(boardKey(from.boardId))
    if (!board) return

    if (from.type === 'list') {
      // цель — любой узел чужого списка: и карточка, и сам список знают, где лежат
      const plan = planListMove(board, from.listId, to.listId)
      if (plan) moveList.mutate({ boardId: from.boardId, listId: from.listId, ...plan })
      return
    }

    const plan = planMove(board, from.card.id, to)
    if (plan) move.mutate({ boardId: from.boardId, cardId: from.card.id, ...plan })
  }

  const notice = hint ?? (failed ? `Не сохранилось: ${failed.message}` : null)

  return (
    <DndContext
      // без явного идентификатора dnd-kit нумерует контексты счётчиком модуля, и на сервере
      // номер выходит другой, чем на клиенте: гидратация расходится на aria-describedby
      id="card-drag"
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={start}
      onDragOver={hover}
      onDragEnd={end}
      onDragCancel={() => setDragged(null)}
    >
      {children}

      {/* накладка живёт вне слотов: иначе её обрезала бы прокручиваемая область доски */}
      {/*
        Приземление отключено: накладка летела бы к исходному узлу карточки, а тот на
        момент отпускания ещё стоит на старом месте — доску перекладывает onMutate тактом
        позже. Получался возврат в прежнюю колонку прямо перед исчезновением.
      */}
      <DragOverlay dropAnimation={null}>
        {dragged?.type === 'card' ? (
          <div
            className={`${CARD_FRAME} rotate-1 border-hair-lit shadow-2xl shadow-black/60`}
          >
            <CardFace
              card={dragged.card}
              title={<p className="text-[13.5px] leading-[1.42] font-medium text-fog">{dragged.card.title}</p>}
            />
          </div>
        ) : null}

        {/* список едет шапкой: тащить под курсором всю колонку с карточками нечитаемо */}
        {dragged?.type === 'list' ? (
          <div className="surface-column flex w-72 rotate-1 items-center gap-2 border-hair-lit px-3.5 py-2.5 shadow-2xl shadow-black/60">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fog">
              {dragged.list.title}
            </span>
            <span className="font-mono text-[11px] text-fog-dim tabular-nums">
              {dragged.list.cards.length}
            </span>
          </div>
        ) : null}
      </DragOverlay>

      {notice ? (
        <p
          role="status"
          className={`absolute bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border px-3.5 py-2 text-xs backdrop-blur-md ${
            hint
              ? 'border-hair-lit bg-ink-deep/90 text-fog-muted'
              : 'border-alarm-line bg-alarm-wash text-alarm'
          }`}
        >
          {notice}
        </p>
      ) : null}
    </DndContext>
  )
}
