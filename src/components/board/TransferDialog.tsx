'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog, Select } from 'radix-ui'
import { useState } from 'react'
import { useTransferCard } from '@/lib/board-mutations'
import { boardQuery } from '@/lib/board-query'
import type { CardView } from '@/lib/board-view'
import { labelColor } from '@/lib/label-colors'
import { transferPreviewQuery } from '@/lib/transfer-query'
import type { BoardSummary } from '@/server/services/boards'
import { Failure } from './Failure'

type Props = {
  boards: BoardSummary[]
  boardId: string
  listId: string
  card: CardView
  onClose: () => void
}

/**
 * Перенос карточки через меню: доска, список и метки, которые снимутся, — всё видно
 * до подтверждения (ADR-005). Место в списке-приёмнике не выбирается: карточка встаёт
 * в конец, дальше её двигают перетаскиванием.
 */
export function TransferDialog({ boards, boardId, listId, card, onClose }: Props) {
  const [targetBoardId, setTargetBoardId] = useState(boardId)
  const [targetListId, setTargetListId] = useState<string | null>(listId)

  const target = useQuery(boardQuery(targetBoardId))
  const preview = useQuery({
    ...transferPreviewQuery(card.id, targetListId ?? ''),
    enabled: targetListId !== null,
  })
  const transfer = useTransferCard(boardId, card.id)

  const unchanged = targetListId === null || targetListId === listId

  function chooseBoard(id: string) {
    setTargetBoardId(id)
    // списки чужой доски ещё не прочитаны, да и прежний выбор к ней не относится
    setTargetListId(id === boardId ? listId : null)
  }

  function submit() {
    if (unchanged || !targetListId) return
    transfer.mutate({ listId: targetListId, targetBoardId }, { onSuccess: onClose })
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 surface-sheet rounded-2xl p-4 outline-none">
          <Dialog.Title className="text-sm font-medium text-fog">
            Перенести карточку
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 truncate text-xs text-fog-dim">
            {card.title}
          </Dialog.Description>

          <div className="mt-4 space-y-3">
            <Choice
              label="Доска"
              value={targetBoardId}
              options={boards}
              placeholder="Выбери доску"
              onChange={chooseBoard}
            />
            <Choice
              label="Список"
              value={targetListId}
              options={target.data?.lists ?? []}
              placeholder={target.isPending ? 'Читаем списки…' : 'Выбери список'}
              onChange={setTargetListId}
            />
          </div>

          {target.data && !target.data.lists.length ? (
            <p className="mt-3 text-xs text-fog-dim">На доске нет ни одного списка.</p>
          ) : null}

          <div className="mt-3 min-h-8">
            {preview.data?.droppedLabels.length ? (
              <>
                <p className="text-xs text-caution">
                  Этих меток на доске-приёмнике нет, они снимутся:
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {preview.data.droppedLabels.map((label) => (
                    <li
                      key={label.id}
                      className="flex items-center gap-1.5 rounded-lg bg-white/6 px-2 py-0.5 text-xs text-fog-muted"
                    >
                      <span
                        className="h-1.5 w-4 rounded-full"
                        style={{ backgroundColor: labelColor(label.color) }}
                      />
                      {label.name || 'без названия'}
                    </li>
                  ))}
                </ul>
              </>
            ) : preview.data?.keptLabels.length ? (
              <p className="text-xs text-fog-dim">Метки переедут все.</p>
            ) : null}
          </div>

          <Failure error={preview.error ?? transfer.error} className="pt-1" />

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close className="btn-quiet px-3 py-1.5 text-sm">
              Отмена
            </Dialog.Close>
            <button
              type="button"
              disabled={unchanged || transfer.isPending}
              onClick={submit}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              Перенести
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type ChoiceProps = {
  label: string
  value: string | null
  options: { id: string; title: string }[]
  placeholder: string
  onChange: (value: string) => void
}

function Choice({ label, value, options, placeholder, onChange }: ChoiceProps) {
  return (
    <div>
      <p className="mb-1 text-xs text-fog-dim">{label}</p>
      <Select.Root value={value ?? undefined} onValueChange={onChange}>
        <Select.Trigger
          aria-label={label}
          disabled={!options.length}
          className="field flex w-full items-center justify-between gap-2 px-2 py-1.5 text-sm disabled:text-fog-dim"
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon className="text-fog-dim">▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-64 overflow-hidden surface-menu"
          >
            <Select.Viewport className="p-1">
              {options.map((option) => (
                <Select.Item
                  key={option.id}
                  value={option.id}
                  className="menu-item px-2 py-1 text-sm"
                >
                  <Select.ItemText>{option.title}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
