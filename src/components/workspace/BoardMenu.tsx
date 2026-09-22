'use client'

import { Dialog, DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { useArchiveBoard, useSetBoardColor } from '@/lib/board-mutations'
import { LABEL_COLORS, labelColor } from '@/lib/label-colors'
import type { BoardSummary } from '@/server/services/boards'

type Props = {
  board: BoardSummary
  onArchived: () => void
  onRecolored: (color: string) => void
}

export function BoardMenu({ board, onArchived, onRecolored }: Props) {
  const [confirming, setConfirming] = useState(false)
  const archive = useArchiveBoard(board.id)
  const recolor = useSetBoardColor(board.id)

  function close() {
    setConfirming(false)
    archive.reset()
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Меню доски"
          title="Меню доски"
          className="btn-quiet px-2 py-1 text-xs leading-none focus-visible:ring-1 focus-visible:ring-accent-line data-[state=open]:bg-white/8"
        >
          ⋯
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={4} className="surface-menu z-50 min-w-40 p-1">
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="menu-item flex items-center gap-2 px-2 py-1 text-sm">
                Цвет
                {board.color ? <Dot color={board.color} /> : null}
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent sideOffset={4} className="surface-menu z-50 min-w-36 p-1">
                  <DropdownMenu.RadioGroup
                    value={board.color ?? ''}
                    onValueChange={(color) =>
                      recolor.mutate(color, { onSuccess: () => onRecolored(color) })
                    }
                  >
                    {LABEL_COLORS.map((color) => (
                      <DropdownMenu.RadioItem
                        key={color.id}
                        value={color.id}
                        className="menu-item flex items-center gap-2 px-2 py-1 text-sm data-[state=checked]:text-fog"
                      >
                        <Dot color={color.id} />
                        {color.name}
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <DropdownMenu.Item
              className="menu-item px-2 py-1 text-sm"
              onSelect={() => setConfirming(true)}
            >
              В архив
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={confirming} onOpenChange={(open) => !open && close()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
          <Dialog.Content className="surface-sheet fixed top-1/2 left-1/2 z-50 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4 outline-none">
            <Dialog.Title className="text-sm font-medium text-fog">
              Доску «{board.title}» в архив?
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs text-fog-dim">
              Пропадёт со стола и из выбора досок вместе со списками и карточками. Вернуть её
              из окна нельзя.
            </Dialog.Description>

            <Failure error={archive.error} className="pt-2" />

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close type="button" className="btn-quiet px-3 py-1.5 text-sm">
                Отмена
              </Dialog.Close>
              <button
                type="button"
                autoFocus
                disabled={archive.isPending}
                onClick={() =>
                  archive.mutate(undefined, {
                    onSuccess: () => {
                      setConfirming(false)
                      onArchived()
                    },
                  })
                }
                className="btn-quiet px-3 py-1.5 text-sm"
              >
                В архив
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: labelColor(color) }}
    />
  )
}
