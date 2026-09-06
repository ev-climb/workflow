'use client'

import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import {
  KindSwitch,
  ScheduleFields,
  scheduleCaption,
  scheduleTimes,
  useSchedule,
} from '@/components/calendar/Schedule'
import { useCreateEvent, useCreateTask } from '@/lib/calendar-mutations'
import type { NoteDropTarget } from '@/lib/note-drop'
import { splitHeading } from '@/lib/notes'
import { useArchiveNote, useNoteToCard } from '@/lib/notes-mutations'
import type { NoteView } from '@/server/services/notes'

/**
 * Текст, с которым заметка поедет дальше. У карточки пункты списка дел становятся
 * чек-листом, поэтому в описание они не идут; у события и задачи чек-листа нет, и
 * пункты остаются строками текста с отметками.
 */
function draftOf(note: NoteView, toCard: boolean): { title: string; description: string } {
  const { heading, rest } = splitHeading(note.title, note.body)
  if (note.kind !== 'list') return { title: heading, description: rest }

  const items = toCard
    ? ''
    : note.items.map((item) => `${item.done ? '✓' : '—'} ${item.title}`).join('\n')

  return { title: heading, description: [rest, items].filter(Boolean).join('\n') }
}

type Props = {
  target: NoteDropTarget
  archives: boolean
  onArchivesChange: (value: boolean) => void
  onClose: () => void
}

/**
 * Заметка на новом месте. Заголовок и описание показываются до создания и правятся здесь
 * же: первая строка заметки почти всегда годится в заголовок карточки, но «почти» — это
 * не «всегда».
 *
 * Место броска решает, что получится: колонка — карточку, сетка — событие или задачу на
 * выбор. Времени у брошенной на сетку заметки столько же, сколько у тайм-блока: час.
 */
export function NoteDropDialog({ target, archives, onArchivesChange, onClose }: Props) {
  const note = target.note
  const toCard = target.kind === 'board'
  const initial = draftOf(note, toCard)

  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [created, setCreated] = useState(false)
  const schedule = useSchedule(!toCard)

  const toCardMutation = useNoteToCard()
  const createEvent = useCreateEvent()
  const createTask = useCreateTask()
  const archive = useArchiveNote(note.id)

  const pending =
    toCardMutation.isPending || createEvent.isPending || createTask.isPending || archive.isPending

  /**
   * Заметка уезжает в архив только после того, как на новом месте всё получилось.
   * Отказ архивирования оставляет окно открытым: закрыть его значило бы соврать,
   * что заметку убрали.
   */
  function done() {
    setCreated(true)
    if (archives) archive.mutate(true, { onSuccess: onClose })
    else onClose()
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()

    // на новом месте уже создано, повтор относится только к неудавшейся уборке в архив
    if (created) {
      done()
      return
    }

    if (target.kind === 'board') {
      toCardMutation.mutate(
        {
          noteId: note.id,
          boardId: target.boardId,
          listId: target.listId,
          title,
          description,
          archive: archives,
        },
        { onSuccess: onClose },
      )
      return
    }

    if (schedule.kind === 'task') {
      if (!schedule.taskListId) return
      createTask.mutate(
        { taskListId: schedule.taskListId, title, notes: description, due: target.range.day },
        { onSuccess: done },
      )
      return
    }

    if (!schedule.calendarId) return
    createEvent.mutate(
      {
        calendarId: schedule.calendarId,
        title,
        description,
        times: scheduleTimes(schedule, target.range),
      },
      { onSuccess: done },
    )
  }

  const ready = created || target.kind === 'board' || schedule.target

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-sheet fixed top-1/2 left-1/2 z-50 w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4 outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-medium text-fog">Из заметки</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fog-dim">
                {target.kind === 'board'
                  ? `Карточка в колонку «${target.listTitle}»`
                  : scheduleCaption(schedule, target.range)}
              </Dialog.Description>
            </div>

            {target.kind === 'calendar' ? (
              <KindSwitch value={schedule.kind} onChange={schedule.setKind} />
            ) : null}
          </div>

          <form onSubmit={submit}>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="drop-title" className="mb-1 block text-xs text-fog-dim">
                  Заголовок
                </label>
                <input
                  id="drop-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoFocus
                  placeholder="Без названия"
                  className="field w-full px-2 py-1.5 text-sm"
                />
              </div>

              <div>
                <label htmlFor="drop-description" className="mb-1 block text-xs text-fog-dim">
                  Описание
                </label>
                <textarea
                  id="drop-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  className="field w-full resize-y px-2 py-1.5 text-[13px] leading-snug"
                />
              </div>

              {target.kind === 'board' && note.items.length ? (
                <p className="text-xs text-fog-dim">
                  Пункты списка дел ({note.items.length}) станут чек-листом карточки.
                </p>
              ) : null}

              {target.kind === 'calendar' ? <ScheduleFields schedule={schedule} /> : null}

              <label className="flex items-center gap-2 text-sm text-fog-muted">
                <input
                  type="checkbox"
                  checked={archives}
                  onChange={(event) => onArchivesChange(event.target.checked)}
                  className="size-3.5 shrink-0 accent-accent"
                />
                Убрать заметку в архив
              </label>
            </div>

            <Failure
              error={
                toCardMutation.error ?? createEvent.error ?? createTask.error ?? archive.error
              }
              className="pt-3"
            />

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close type="button" className="btn-quiet px-3 py-1.5 text-sm">
                Отмена
              </Dialog.Close>
              <button
                type="submit"
                disabled={!ready || pending}
                className="btn-primary px-3 py-1.5 text-sm"
              >
                {created ? 'Убрать в архив' : 'Создать'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
