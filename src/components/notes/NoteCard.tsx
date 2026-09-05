'use client'

import { useDraggable } from '@dnd-kit/core'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { formatStamp } from '@/lib/dates'
import { noteHeading } from '@/lib/notes'
import { useArchiveNote, useDeleteNote, useMoveNote } from '@/lib/notes-mutations'
import type { FolderView, NoteView } from '@/server/services/notes'
import { NoteEditor } from './NoteEditor'
import { NoteItems } from './NoteItems'

const ITEM = 'menu-item px-2 py-1 text-sm'

type Props = { note: NoteView; folders: FolderView[]; autoEdit?: boolean }

/**
 * Заметка в шторке. Щелчок открывает правку, перетаскивание уносит её в колонку доски
 * или на сетку календаря — там заметку встречает окно переноса. На время правки
 * перетаскивание выключено: иначе выделение текста мышью утаскивало бы заметку.
 */
export function NoteCard({ note, folders, autoEdit = false }: Props) {
  // только что заведённую заметку сразу открываем в правке: её завели, чтобы написать
  const [editing, setEditing] = useState(autoEdit)
  const archive = useArchiveNote(note.id)
  const remove = useDeleteNote(note.id)
  const move = useMoveNote(note.id)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `note:${note.id}`,
    data: { type: 'note', note },
    disabled: editing,
  })

  const heading = noteHeading(note)
  const body = note.kind === 'text' ? (note.body ?? '') : ''
  // заголовок собран из первой строки — показывать её же второй раз незачем
  const rest = note.title?.trim() ? body : body.slice(heading.length).trim()

  const done = note.items.filter((item) => item.done).length
  const list = note.kind === 'list'

  return (
    <li
      ref={setNodeRef}
      className={`surface-note group/note relative p-[15px] ${list ? 'surface-note-list' : ''} ${
        isDragging ? 'opacity-40' : ''
      } ${editing ? '' : 'surface-note-lift'}`}
    >
      <div
        // в правке заметка не таскается, и признаки перетаскивания сняты целиком:
        // при `aria-disabled` на обёртке поля внутри неё считаются отключёнными
        {...(editing ? {} : { ...listeners, ...attributes })}
        role={editing ? undefined : 'button'}
        tabIndex={editing ? undefined : 0}
        onClick={() => !editing && setEditing(true)}
        className={`flex flex-col gap-3 text-left outline-none ${editing ? '' : 'cursor-pointer'}`}
      >
        {editing ? (
          <NoteEditor note={note} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <p className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-[-0.01em] text-fog">
                {heading || 'Пустая заметка'}
              </p>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-fog-dim tabular-nums">
                {list ? `${done}/${note.items.length}` : formatStamp(note.updatedAt)}
              </span>
            </div>

            {list && note.items.length ? (
              <div className="note-progress">
                <span style={{ width: `${Math.round((done / note.items.length) * 100)}%` }} />
              </div>
            ) : null}

            {rest ? (
              <p className="line-clamp-6 text-[13px] leading-[1.55] whitespace-pre-wrap text-fog-muted">
                {rest}
              </p>
            ) : null}

            {list ? <NoteItems items={note.items} editing={false} /> : null}
          </>
        )}
      </div>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Меню заметки"
          title="Меню заметки"
          className="btn-quiet absolute top-2.5 right-2.5 bg-ink-deep/70 px-1.5 text-xs leading-none opacity-0 backdrop-blur-sm group-hover/note:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          ⋯
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="surface-menu z-50 min-w-52 p-1"
          >
            {note.archived ? (
              <>
                <DropdownMenu.Item className={ITEM} onSelect={() => archive.mutate(false)}>
                  Вернуть из архива
                </DropdownMenu.Item>
                <DropdownMenu.Item className={ITEM} onSelect={() => remove.mutate()}>
                  Удалить насовсем
                </DropdownMenu.Item>
              </>
            ) : (
              <>
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className={ITEM}>В директорию</DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      sideOffset={4}
                      className="surface-menu z-50 min-w-48 p-1"
                    >
                      {folders.map((folder) => (
                        <DropdownMenu.Item
                          key={folder.id}
                          className={ITEM}
                          disabled={folder.id === note.folderId}
                          onSelect={() => move.mutate(folder.id)}
                        >
                          {folder.title}
                        </DropdownMenu.Item>
                      ))}
                      <DropdownMenu.Item
                        className={ITEM}
                        disabled={note.folderId === null}
                        onSelect={() => move.mutate(null)}
                      >
                        Без директории
                      </DropdownMenu.Item>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
                <DropdownMenu.Item className={ITEM} onSelect={() => archive.mutate(true)}>
                  В архив
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Failure error={archive.error ?? remove.error ?? move.error} className="pt-2" />
    </li>
  )
}
