'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CardDragArea } from '@/components/board/CardDragArea'
import { sendJson } from '@/lib/api-client'
import type { BoardView } from '@/lib/board-view'
import type { CalendarMode } from '@/lib/calendar-grid'
import { clampRatio } from '@/lib/split-ratio'
import type { BoardSummary } from '@/server/services/boards'
import type { Slot } from '@/server/services/workspace'
import { BoardSlot } from './BoardSlot'
import { CalendarColumn } from './CalendarColumn'
import { Splitter } from './Splitter'

const SPLITTER_PX = 9
const SAVE_DELAY_MS = 400

type Props = {
  boards: BoardSummary[]
  /** Доски слотов, прочитанные на сервере: первая отрисовка идёт без похода в сеть. */
  initialBoards: Record<string, BoardView>
  topBoardId: string | null
  bottomBoardId: string | null
  topBoardRatio: number
  calendarMode: CalendarMode
  today: string
}

export function Workspace({
  boards,
  initialBoards,
  topBoardId,
  bottomBoardId,
  topBoardRatio,
  calendarMode,
  today,
}: Props) {
  const [slots, setSlots] = useState<Record<Slot, string | null>>({
    top: topBoardId,
    bottom: bottomBoardId,
  })
  const [ratio, setRatio] = useState(topBoardRatio)
  const [mode, setMode] = useState(calendarMode)
  const [failure, setFailure] = useState<string | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (patch: Record<string, unknown>): Promise<boolean> => {
    try {
      await sendJson('PATCH', '/api/workspace', patch)
      setFailure(null)
      return true
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'сервер не ответил')
      return false
    }
  }, [])

  /** Запись отложена: на каждое движение мыши это сотни запросов в секунду. */
  const changeRatio = useCallback(
    (value: number) => {
      const clamped = clampRatio(value)
      setRatio(clamped)
      if (pending.current) clearTimeout(pending.current)
      pending.current = setTimeout(() => void save({ topBoardRatio: clamped }), SAVE_DELAY_MS)
    },
    [save],
  )

  useEffect(() => () => void (pending.current && clearTimeout(pending.current)), [])

  const dragTo = useCallback(
    (clientY: number) => {
      const box = area.current?.getBoundingClientRect()
      if (!box) return

      // граница занимает свои пиксели: доли делят то, что осталось, и курсор целится в середину
      const usable = box.height - SPLITTER_PX
      if (usable > 0) changeRatio((clientY - box.top - SPLITTER_PX / 2) / usable)
    },
    [changeRatio],
  )

  const chooseBoard = useCallback(
    async (slot: Slot, boardId: string | null) => {
      const previous = slots[slot]
      if (previous === boardId) return

      setSlots((current) => ({ ...current, [slot]: boardId }))
      if (!(await save({ slot, boardId }))) {
        setSlots((current) => ({ ...current, [slot]: previous }))
      }
    },
    [save, slots],
  )

  const chooseMode = useCallback(
    async (next: CalendarMode) => {
      const previous = mode
      if (previous === next) return

      setMode(next)
      if (!(await save({ calendarMode: next }))) setMode(previous)
    },
    [mode, save],
  )

  return (
    <CardDragArea>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <CalendarColumn mode={mode} today={today} onModeChange={(next) => void chooseMode(next)} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          {failure ? (
            <p
              role="status"
              className="absolute top-2 right-3 z-50 rounded-xl border border-alarm-line bg-alarm-wash px-3 py-1.5 text-xs text-alarm backdrop-blur-md"
            >
              Не сохранилось: {failure}
            </p>
          ) : null}
          <div
            ref={area}
            className="grid min-h-0 min-w-0 flex-1"
            style={{ gridTemplateRows: `${ratio}fr ${SPLITTER_PX}px ${1 - ratio}fr` }}
          >
            <BoardSlot
              slot="top"
              boards={boards}
              boardId={slots.top}
              initial={slots.top ? initialBoards[slots.top] : undefined}
              onChoose={(boardId) => void chooseBoard('top', boardId)}
            />
            <Splitter
              ratio={ratio}
              onDragTo={dragTo}
              onStep={(delta) => changeRatio(ratio + delta)}
            />
            <BoardSlot
              slot="bottom"
              boards={boards}
              boardId={slots.bottom}
              initial={slots.bottom ? initialBoards[slots.bottom] : undefined}
              onChoose={(boardId) => void chooseBoard('bottom', boardId)}
            />
          </div>
        </div>
      </div>
    </CardDragArea>
  )
}
