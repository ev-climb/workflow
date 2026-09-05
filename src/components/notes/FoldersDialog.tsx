'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { TitleField } from '@/components/board/TitleField'
import { useCreateFolder, useDeleteFolder, useRenameFolder } from '@/lib/notes-mutations'
import { foldersQuery } from '@/lib/notes-query'
import type { FolderView } from '@/server/services/notes'

/**
 * Строка директории: щелчок по названию открывает переименование. Удаление спрашивается
 * только у непустой — заметки она не уносит, но пропажа директории из-под десятка
 * заметок должна быть осознанной.
 */
function Row({ folder }: { folder: FolderView }) {
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const rename = useRenameFolder(folder.id)
  const remove = useDeleteFolder(folder.id)

  return (
    <li className="flex items-center gap-2 py-1">
      {renaming ? (
        <TitleField
          initial={folder.title}
          label="Название директории"
          onSubmit={(title) => rename.mutate(title)}
          onClose={() => setRenaming(false)}
          className="field w-full px-2 py-1 text-sm"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="min-w-0 flex-1 truncate rounded-lg px-1.5 py-0.5 text-left text-sm text-fog outline-none transition-colors hover:bg-white/6 focus-visible:ring-1 focus-visible:ring-accent-line"
          >
            {folder.title}
          </button>
          <span className="font-mono text-[11px] text-fog-dim tabular-nums">{folder.notes}</span>
          {confirming ? (
            <>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
                className="btn-quiet px-2 py-0.5 text-xs text-alarm"
              >
                Удалить
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn-quiet px-2 py-0.5 text-xs"
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label={`Удалить директорию «${folder.title}»`}
              onClick={() => (folder.notes ? setConfirming(true) : remove.mutate())}
              className="btn-quiet px-1.5 py-0.5 text-xs leading-none"
            >
              ✕
            </button>
          )}
        </>
      )}
      <Failure error={rename.error ?? remove.error} />
    </li>
  )
}

export function FoldersDialog({ onClose }: { onClose: () => void }) {
  const folders = useQuery(foldersQuery)
  const create = useCreateFolder()

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-sheet fixed top-1/2 left-1/2 z-50 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4 outline-none">
          <Dialog.Title className="text-sm font-medium text-fog">Директории</Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-fog-dim">
            Удалённая директория отпускает заметки, а не уносит их.
          </Dialog.Description>

          <ul className="mt-3 max-h-72 overflow-y-auto">
            {(folders.data ?? []).map((folder) => (
              <Row key={folder.id} folder={folder} />
            ))}
          </ul>

          {folders.data && !folders.data.length ? (
            <p className="py-2 text-xs text-fog-dim">Ни одной директории пока нет.</p>
          ) : null}

          <div className="mt-3">
            <TitleField
              initial=""
              label="Новая директория"
              clearOnSubmit
              onSubmit={(title) => create.mutate(title)}
              onClose={() => {}}
              className="field w-full px-2 py-1.5 text-sm"
            />
          </div>

          <Failure error={folders.error ?? create.error} className="pt-2" />

          <div className="mt-4 flex justify-end">
            <Dialog.Close type="button" className="btn-quiet px-3 py-1.5 text-sm">
              Закрыть
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
