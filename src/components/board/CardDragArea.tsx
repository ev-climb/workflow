'use client'

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
import { planListMove, planMove, type DragData } from '@/lib/board-move'
import { boardKey } from '@/lib/board-query'
import type { BoardView } from '@/lib/board-view'
import { covers, isDueDrop, pointerAt, trackPointer } from '@/lib/calendar-drop'
import { CARD_FRAME, CardFace } from './BoardCard'

const ACROSS_BOARDS =
  'Между досками карточка переносится через меню карточки: у досок разные метки, ' +
  'и перетаскивание сняло бы их молча.'

const LIST_ACROSS_BOARDS = 'Список переставляется только внутри своей доски.'

const across = (from: DragData) => (from.type === 'list' ? LIST_ACROSS_BOARDS : ACROSS_BOARDS)

const NOTICE_MS = 6000

const dragData = (data: unknown): DragData | undefined => data as DragData | undefined

/** Цель на доске. Календарь себя обслуживает сам — здесь его броски не наши. */
const boardTarget = (data: unknown): DragData | undefined =>
  isDueDrop(data) ? undefined : dragData(data)

/**
 * Календарь ловит карточку точкой курсора, доски — ближайшими углами, как раньше:
 * столбец календаря во весь экран иначе перетягивал бы на себя броски внутри доски.
 * Точка своя, а мерки снимаются на месте — почему, сказано у `trackPointer`.
 */
const collisions: CollisionDetection = (args) => {
  const at = pointerAt()
  const caught =
    at &&
    args.droppableContainers.find(
      (container) => isDueDrop(container.data.current) && covers(container.node.current, at),
    )
  if (caught) return [{ id: caught.id, data: { droppableContainer: caught } }]

  const board = args.droppableContainers.filter((container) => !isDueDrop(container.data.current))
  return closestCorners({ ...args, droppableContainers: board })
}

/**
 * Перетаскивание карточек и списков на весь стол, вместе с календарём. Контекст один на
 * обе доски, а не по одному на доску: только так видно попытку перетащить через границу —
 * её отменяем с подсказкой, а не молча (ADR-005). Календарь в том же контексте, потому
 * что карточку бросают с доски прямо в него; сами броски разбирает он.
 */
export function CardDragArea({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const move = useMoveCard()
  const moveList = useMoveList()
  const [dragged, setDragged] = useState<DragData | null>(null)
  const [aiming, setAiming] = useState(false)
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

  // указатель нужен, пока карточку держат: по нему календарь выбирает день и время
  useEffect(() => (dragged ? trackPointer() : undefined), [dragged])

  const sensors = useSensors(
    // порог обязателен: без него карточку не ткнуть мышью и не переименовать двойным кликом
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function start({ active }: DragStartEvent) {
    setHint(null)
    setAiming(false)
    setDragged(dragData(active.data.current) ?? null)
  }

  /** Подсказка появляется, пока карточку ещё держат: отказ на отпускании — уже поздно. */
  function hover({ active, over }: DragOverEvent) {
    setAiming(isDueDrop(over?.data.current))

    const from = dragData(active.data.current)
    const to = boardTarget(over?.data.current)
    if (!from || !to) return

    setHint(to.boardId === from.boardId ? null : across(from))
  }

  function end({ active, over }: DragEndEvent) {
    setDragged(null)
    setAiming(false)

    const from = dragData(active.data.current)
    const to = boardTarget(over?.data.current)
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
      collisionDetection={collisions}
      onDragStart={start}
      onDragOver={hover}
      onDragEnd={end}
      onDragCancel={() => {
        setDragged(null)
        setAiming(false)
      }}
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
          // над календарём накладка просвечивает: под ней пунктир с временем будущего срока
          <div
            className={`${CARD_FRAME} rotate-1 border-neutral-600 shadow-lg shadow-black/60 ${
              aiming ? 'opacity-40' : ''
            }`}
          >
            <CardFace
              card={dragged.card}
              title={<p className="text-sm leading-snug text-neutral-100">{dragged.card.title}</p>}
            />
          </div>
        ) : null}

        {/* список едет шапкой: тащить под курсором всю колонку с карточками нечитаемо */}
        {dragged?.type === 'list' ? (
          <div className="flex w-72 rotate-1 items-center gap-2 rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 shadow-lg shadow-black/60">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-200">
              {dragged.list.title}
            </span>
            <span className="text-xs text-neutral-500 tabular-nums">
              {dragged.list.cards.length}
            </span>
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
