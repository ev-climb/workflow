'use client'

import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { useCreateBoard } from '@/lib/board-mutations'
import type { BoardSummary } from '@/server/services/boards'

type Props = {
  onCreated: (board: BoardSummary) => void
  onClose: () => void
}

/** Не `TitleField`: тот сохраняет и по уходу фокуса, и щелчок по «Отмена» заводил бы доску. */
export function NewBoardDialog({ onCreated, onClose }: Props) {
  const [title, setTitle] = useState('')
  const create = useCreateBoard()

  function submit() {
    const name = title.trim()
    if (!name || create.isPending) return
    create.mutate(name, {
      onSuccess: (board) => {
        onCreated(board)
        onClose()
      },
    })
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-sheet fixed top-1/2 left-1/2 z-50 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4 outline-none">
          <Dialog.Title className="text-sm font-medium text-fog">Новая доска</Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-fog-dim">
            Встанет в этот слот.
          </Dialog.Description>

          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <input
              autoFocus
              spellCheck={false}
              aria-label="Название доски"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="field w-full px-2 py-1.5 text-sm outline-none"
            />

            <Failure error={create.error} className="pt-2" />

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close type="button" className="btn-quiet px-3 py-1.5 text-sm">
                Отмена
              </Dialog.Close>
              <button
                type="submit"
                disabled={!title.trim() || create.isPending}
                className="btn-quiet px-3 py-1.5 text-sm"
              >
                Создать
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
