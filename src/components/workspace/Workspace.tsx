'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  topBoardId: string | null
  bottomBoardId: string | null
  topBoardRatio: number
}

export function Workspace({ boards, topBoardId, bottomBoardId, topBoardRatio }: Props) {
  const [slots, setSlots] = useState<Record<Slot, string | null>>({
    top: topBoardId,
    bottom: bottomBoardId,
  })
  const [ratio, setRatio] = useState(topBoardRatio)
  const [failure, setFailure] = useState<string | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (patch: Record<string, unknown>): Promise<boolean> => {
    try {
      const response = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (response.ok) {
        setFailure(null)
        return true
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      setFailure(body?.error ?? `сервер ответил ${response.status}`)
    } catch {
      setFailure('сервер не ответил')
    }
    return false
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

  return (
    <div className="flex h-screen overflow-hidden">
      <CalendarColumn />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {failure ? (
          <p
            role="status"
            className="absolute top-2 right-3 z-50 rounded border border-red-900 bg-red-950 px-2 py-1 text-xs text-red-200"
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
            onChoose={(boardId) => void chooseBoard('top', boardId)}
          />
          <Splitter ratio={ratio} onDragTo={dragTo} onStep={(delta) => changeRatio(ratio + delta)} />
          <BoardSlot
            slot="bottom"
            boards={boards}
            boardId={slots.bottom}
            onChoose={(boardId) => void chooseBoard('bottom', boardId)}
          />
        </div>
      </div>
    </div>
  )
}
