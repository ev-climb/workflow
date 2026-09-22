'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CardDragArea } from '@/components/board/CardDragArea'
import { NotesDrawer } from '@/components/notes/NotesDrawer'
import { sendJson } from '@/lib/api-client'
import type { BoardView } from '@/lib/board-view'
import { isFullScreen, type CalendarMode } from '@/lib/calendar-grid'
import { clampRatio } from '@/lib/split-ratio'
import { usePhone } from '@/lib/touch'
import type { BoardSummary } from '@/server/services/boards'
import type { Slot } from '@/server/services/workspace'
import { BoardSlot } from './BoardSlot'
import { CalendarColumn } from './CalendarColumn'
import { MobileNav, type Tab } from './MobileNav'
import { Splitter } from './Splitter'

const SPLITTER_PX = 9
const SAVE_DELAY_MS = 400

type Props = {
  boards: BoardSummary[]
  /** Доски слотов, прочитанные на сервере: первая отрисовка идёт без похода в сеть. */
  initialBoards: Record<string, BoardView>
  /** Когда их прочитали: иначе запрос считает их свежими с гидратации, а не с чтения. */
  initialBoardsAt: number
  topBoardId: string | null
  bottomBoardId: string | null
  topBoardRatio: number
  calendarMode: CalendarMode
  notesOpen: boolean
  noteDropArchives: boolean
  today: string
}

export function Workspace({
  boards,
  initialBoards,
  initialBoardsAt,
  topBoardId,
  bottomBoardId,
  topBoardRatio,
  calendarMode,
  notesOpen,
  noteDropArchives,
  today,
}: Props) {
  const [slots, setSlots] = useState<Record<Slot, string | null>>({
    top: topBoardId,
    bottom: bottomBoardId,
  })
  /**
   * Слоты идут за пропсом: по ссылке на карточку страница подставляет её доску наверх, и
   * без этого мягкий переход оставил бы стол с доской, прочитанной при монтировании.
   */
  const given = useRef({ top: topBoardId, bottom: bottomBoardId })
  if (given.current.top !== topBoardId || given.current.bottom !== bottomBoardId) {
    given.current = { top: topBoardId, bottom: bottomBoardId }
    setSlots({ top: topBoardId, bottom: bottomBoardId })
  }
  const [ratio, setRatio] = useState(topBoardRatio)
  const [mode, setMode] = useState(calendarMode)
  // сегодняшняя дата посчитана на сервере: первая отрисовка совпадает с браузерной
  const [anchor, setAnchor] = useState(today)
  const [notes, setNotes] = useState(notesOpen)
  const [archives, setArchives] = useState(noteDropArchives)
  const [failure, setFailure] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('top')
  const phone = usePhone()
  // список досок читает сервер при загрузке стола: заведённые и заархивированные с тех пор
  // учитываются здесь
  const [created, setCreated] = useState<BoardSummary[]>([])
  const [archived, setArchived] = useState<string[]>([])
  const [colors, setColors] = useState<Record<string, string>>({})
  const shown = [
    ...boards,
    ...created.filter((board) => !boards.some(({ id }) => id === board.id)),
  ]
    .filter((board) => !archived.includes(board.id))
    .map((board) => (colors[board.id] ? { ...board, color: colors[board.id] } : board))
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

  function addBoard(slot: Slot, board: BoardSummary) {
    setCreated((current) => [...current, board])
    void chooseBoard(slot, board.id)
  }

  function recolorBoard(boardId: string, color: string) {
    setColors((current) => ({ ...current, [boardId]: color }))
  }

  // в базе слот продолжает указывать на доску, но стол при загрузке такой слот и так показывает пустым
  function dropBoard(boardId: string) {
    setArchived((current) => [...current, boardId])
    setSlots((current) => ({
      top: current.top === boardId ? null : current.top,
      bottom: current.bottom === boardId ? null : current.bottom,
    }))
  }

  const chooseMode = useCallback(
    async (next: CalendarMode) => {
      const previous = mode
      if (previous === next) return

      setMode(next)
      if (!(await save({ calendarMode: next }))) setMode(previous)
    },
    [mode, save],
  )

  const showNotes = useCallback(
    async (open: boolean) => {
      setNotes(open)
      if (!(await save({ notesOpen: open }))) setNotes(!open)
    },
    [save],
  )

  const rememberArchives = useCallback(
    async (value: boolean) => {
      setArchives(value)
      if (!(await save({ noteDropArchives: value }))) setArchives(!value)
    },
    [save],
  )

  // одна доска в обоих слотах отрисовывает карточку дважды: ссылку на неё отрабатывает
  // только верхний экземпляр, иначе поверх стола открылись бы два одинаковых диалога
  const doubled = slots.top !== null && slots.top === slots.bottom

  // неделя в ширину телефона не влезает: там всегда день, а вид, выбранный на ноутбуке, не трогаем
  const shownMode: CalendarMode = phone ? 'day' : mode
  const full = isFullScreen(shownMode)

  const titleOf = (boardId: string | null) =>
    shown.find((board) => board.id === boardId)?.title ?? 'Пусто'

  return (
    <CardDragArea
      noteDropArchives={archives}
      onNoteDropArchivesChange={(value) => void rememberArchives(value)}
    >
      <div className="relative flex min-h-0 flex-1 overflow-hidden max-md:flex-col">
        {/* доски держат свою ширину и уезжают за край окна: иначе их колонки
            пересчитывались бы на каждом кадре раскрытия календаря */}
        <div
          className={`relative flex min-h-0 min-w-0 flex-1 overflow-hidden ${
            tab === 'notes' ? 'max-md:hidden' : ''
          }`}
        >
          <CalendarColumn
            mode={shownMode}
            anchor={anchor}
            onAnchorChange={setAnchor}
            className={tab === 'calendar' ? 'max-md:w-full max-md:border-r-0' : 'max-md:hidden'}
            onModeChange={(next) => void chooseMode(next)}
          />
          {failure ? (
            <p
              role="status"
              className="absolute top-2 right-3 z-50 rounded-xl border border-alarm-line bg-alarm-wash px-3 py-1.5 text-xs text-alarm backdrop-blur-md"
            >
              Не сохранилось: {failure}
            </p>
          ) : null}
          <div
            className={`flex min-h-0 w-[calc(100%-19rem)] shrink-0 flex-col max-md:w-full ${
              tab === 'top' || tab === 'bottom' ? '' : 'max-md:hidden'
            }`}
            inert={full}
          >
            <div
              ref={area}
              className="grid min-h-0 min-w-0 flex-1 max-md:grid-rows-[minmax(0,1fr)]!"
              style={{ gridTemplateRows: `${ratio}fr ${SPLITTER_PX}px ${1 - ratio}fr` }}
            >
              <BoardSlot
                slot="top"
                className={tab === 'top' ? undefined : 'max-md:hidden'}
                boards={shown}
                boardId={slots.top}
                linkable
                initial={slots.top ? initialBoards[slots.top] : undefined}
                initialAt={initialBoardsAt}
                onChoose={(boardId) => void chooseBoard('top', boardId)}
                onCreated={(board) => addBoard('top', board)}
                onArchived={dropBoard}
                onRecolored={recolorBoard}
              />
              <Splitter
                ratio={ratio}
                className="max-md:hidden"
                onDragTo={dragTo}
                onStep={(delta) => changeRatio(ratio + delta)}
              />
              <BoardSlot
                slot="bottom"
                className={tab === 'bottom' ? undefined : 'max-md:hidden'}
                boards={shown}
                boardId={slots.bottom}
                linkable={!doubled}
                initial={slots.bottom ? initialBoards[slots.bottom] : undefined}
                initialAt={initialBoardsAt}
                onChoose={(boardId) => void chooseBoard('bottom', boardId)}
                onCreated={(board) => addBoard('bottom', board)}
                onArchived={dropBoard}
                onRecolored={recolorBoard}
              />
            </div>
          </div>
        </div>
        <NotesDrawer
          open={notes}
          tabbed={tab === 'notes'}
          day={anchor}
          onOpenChange={(open) => void showNotes(open)}
        />
        <MobileNav tab={tab} top={titleOf(slots.top)} bottom={titleOf(slots.bottom)} onChange={setTab} />
      </div>
    </CardDragArea>
  )
}
