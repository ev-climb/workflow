'use client'

import { useQuery } from '@tanstack/react-query'
import { Select } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { useCreateNote } from '@/lib/notes-mutations'
import { foldersQuery, notesQuery, type NotesView } from '@/lib/notes-query'
import { FoldersDialog } from './FoldersDialog'
import { NoteCard } from './NoteCard'

const ALL = 'all'
const LOOSE = 'none'
const ARCHIVE = 'archive'

/** Значение выбора вида в запрос к серверу. Идентификатор директории — сам себе значение. */
function viewOf(value: string): NotesView {
  if (value === ALL) return {}
  if (value === ARCHIVE) return { archived: true }
  if (value === LOOSE) return { folderId: null }
  return { folderId: value }
}

/** Куда попадёт новая заметка: в открытую директорию, а из общих видов — никуда. */
const folderOf = (value: string): string | null =>
  value === ALL || value === ARCHIVE || value === LOOSE ? null : value

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

/**
 * Шторка заметок у правого края. Свёрнутая — полоска во всю высоту, и щёлкнуть по ней
 * можно где угодно; раскрытая уезжает поверх доски, не сдвигая её: доски и так делят
 * высоту, отдавать им ещё и ширину под заметки незачем.
 *
 * Полоска остаётся в потоке и раскрытой: иначе доска дёргалась бы на её ширину при
 * каждом открытии.
 */
export function NotesDrawer({ open, onOpenChange }: Props) {
  const [view, setView] = useState<string>(ALL)
  const [managing, setManaging] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)

  const folders = useQuery(foldersQuery)
  // читаем и свёрнутой: на полоске стоит счётчик, и раскрывается она уже с заметками
  const notes = useQuery(notesQuery(viewOf(view)))
  const create = useCreateNote()

  function add(kind: 'text' | 'list') {
    create.mutate(
      { kind, folderId: folderOf(view) },
      { onSuccess: (note) => setFresh(note.id) },
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="Заметки"
        title="Заметки"
        onClick={() => onOpenChange(true)}
        // под раскрытой шторкой полоска гаснет: её видно сквозь размытие панели, и с
        // клавиатуры она была бы вторым способом закрыть то, что и так закрывают стрелкой
        inert={open}
        className={`surface-notes group/rail flex w-[54px] shrink-0 flex-col items-center gap-4 py-4 outline-none transition-[opacity,background-color] duration-[420ms] ease-[var(--ease-glide)] hover:bg-white/4 motion-reduce:transition-none focus-visible:ring-1 focus-visible:ring-accent-line ${
          open ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="grid size-[30px] place-items-center rounded-[10px] border border-hair bg-white/5 text-[13px] text-fog-dim transition-all duration-300 group-hover/rail:-translate-x-0.5 group-hover/rail:border-accent-line group-hover/rail:bg-accent-wash group-hover/rail:text-white">
          ‹
        </span>
        <span className="rotate-180 text-[12.5px] font-semibold tracking-[0.12em] text-fog-muted uppercase [writing-mode:vertical-rl]">
          Заметки
        </span>
        <span className="pulse size-[5px] rounded-full bg-[oklch(0.78_0.14_300)] shadow-[0_0_10px_oklch(0.75_0.15_300)]" />
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-fog-dim tabular-nums">
          {notes.data?.length ?? ''}
        </span>
      </button>

      <aside
        aria-label="Заметки"
        // свёрнутая шторка остаётся в разметке ради выезда, но целиком выключена:
        // фокус в неё не заходит, и с клавиатуры её нет
        inert={!open}
        className={`surface-notes absolute inset-y-0 right-0 z-40 flex w-[372px] max-w-[calc(100vw-3rem)] flex-col rounded-l-2xl transition-[transform,opacity] duration-[420ms] ease-[var(--ease-glide)] motion-reduce:transition-none ${
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-hair px-[18px] py-3.5">
          <Select.Root value={view} onValueChange={setView}>
            <Select.Trigger
              aria-label="Что показывать"
              className="flex min-w-0 items-center gap-2 rounded-[13px] border border-white/10 bg-[linear-gradient(150deg,rgb(255_255_255/0.09),rgb(255_255_255/0.03))] px-3 py-[7px] text-[13px] font-medium transition-all duration-300 outline-none hover:border-accent-line hover:bg-accent-wash focus-visible:border-accent-line"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-[oklch(0.78_0.14_300)] shadow-[0_0_9px_oklch(0.75_0.15_300)]" />
              <Select.Value />
              <Select.Icon className="text-[8px] text-fog-dim">▾</Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                className="surface-menu z-50 max-h-72 overflow-hidden"
              >
                <Select.Viewport className="p-1">
                  <Select.Item value={ALL} className="menu-item px-2 py-1 text-sm">
                    <Select.ItemText>Все заметки</Select.ItemText>
                  </Select.Item>
                  <Select.Item value={LOOSE} className="menu-item px-2 py-1 text-sm">
                    <Select.ItemText>Без директории</Select.ItemText>
                  </Select.Item>
                  {(folders.data ?? []).map((folder) => (
                    <Select.Item
                      key={folder.id}
                      value={folder.id}
                      className="menu-item flex items-center gap-2 px-2 py-1 text-sm"
                    >
                      <Select.ItemText>{folder.title}</Select.ItemText>
                      <span className="ml-auto font-mono text-[11px] text-fog-dim tabular-nums">
                        {folder.notes}
                      </span>
                    </Select.Item>
                  ))}
                  <Select.Item value={ARCHIVE} className="menu-item px-2 py-1 text-sm">
                    <Select.ItemText>Архив</Select.ItemText>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          <span className="flex-1" />

          <button
            type="button"
            onClick={() => setManaging(true)}
            title="Директории"
            aria-label="Директории"
            className="btn-quiet px-2 py-1 text-xs"
          >
            Директории
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            title="Свернуть заметки"
            aria-label="Свернуть заметки"
            className="btn-quiet px-2 py-1 text-sm leading-none"
          >
            →
          </button>
        </div>

        {view === ARCHIVE ? null : (
          <div className="grid grid-cols-2 gap-2.5 px-[18px] pt-3.5">
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => add('text')}
              className="tile-add flex items-center justify-center gap-1.5 px-2.5 py-[11px] text-[12.5px] font-medium"
            >
              <span className="text-sm leading-none text-[oklch(0.8_0.13_300)]">+</span> Заметка
            </button>
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => add('list')}
              className="tile-add tile-add-cool flex items-center justify-center gap-1.5 px-2.5 py-[11px] text-[12.5px] font-medium"
            >
              <span className="text-sm leading-none text-[oklch(0.82_0.11_195)]">+</span> Список
              дел
            </button>
          </div>
        )}

        <Failure error={notes.error ?? create.error} className="px-[18px] pt-2" />

        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] pt-3.5 pb-6">
          {(notes.data ?? []).map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              folders={folders.data ?? []}
              autoEdit={note.id === fresh}
            />
          ))}
        </ul>

        {notes.data && !notes.data.length ? (
          <p className="px-[18px] pb-4 text-xs text-fog-dim">
            {view === ARCHIVE ? 'В архиве пусто.' : 'Заметок пока нет.'}
          </p>
        ) : null}
    </aside>

      {managing ? <FoldersDialog onClose={() => setManaging(false)} /> : null}
    </>
  )
}
