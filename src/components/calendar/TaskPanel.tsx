'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { useEditTask, type TaskEdit } from '@/lib/calendar-mutations'
import { taskQuery } from '@/lib/calendar-query'
import type { CalendarTaskDetails } from '@/server/services/google-tasks'

type Props = { taskId: string; title: string; onClose: () => void }

/**
 * Задача Google изнутри, по образцу панели события: поля записываются сами, при уходе
 * фокуса, и закрытие панели правку не теряет.
 *
 * Название известно заранее, с полосы: пока задача читается, у диалога есть имя.
 */
export function TaskPanel({ taskId, title, onClose }: Props) {
  const { data, error, isPending } = useQuery(taskQuery(taskId))
  const flush = useRef<() => void>(() => {})

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (open) return
        flush.current()
        onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-sheet fixed top-0 right-0 z-50 flex h-full w-112 max-w-[calc(100vw-3rem)] flex-col overflow-y-auto rounded-l-2xl border-y-0 border-r-0 p-5 outline-none">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="px-1.5 text-base leading-snug font-medium text-fog">
                {data?.title ?? title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 truncate px-1.5 text-xs text-fog-dim">
                {data ? data.taskListTitle : 'Читаем задачу…'}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Закрыть панель"
              className="btn-quiet px-2 py-0.5 leading-none"
            >
              ✕
            </Dialog.Close>
          </div>

          {error ? (
            <p role="status" className="mt-6 text-sm text-alarm">
              Задача не прочиталась: {error.message}
            </p>
          ) : isPending ? null : (
            <TaskForm key={data.id} task={data} flush={flush} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type Draft = { title: string; notes: string; due: string }

function draftOf(task: CalendarTaskDetails): Draft {
  return { title: task.title ?? '', notes: task.notes ?? '', due: task.due }
}

function TaskForm({
  task,
  flush,
}: {
  task: CalendarTaskDetails
  /** Дописать несохранённое перед закрытием панели: снятия фокуса при этом не будет. */
  flush: React.RefObject<() => void>
}) {
  const [draft, setDraft] = useState(() => draftOf(task))
  const [gone, setGone] = useState(false)
  const edit = useEditTask(task.id)

  // что уже записано: своя запись и правка, приехавшая из Google, двигают точку отсчёта
  const written = useRef(draft)
  useEffect(() => {
    written.current = draftOf(task)
  }, [task])

  function write(changes: TaskEdit) {
    // задачу, стёртую в Google из-под нас, правкой не воскрешаем
    edit.mutate(changes, {
      onSuccess: (result) => {
        if (result.goneInGoogle) setGone(true)
      },
    })
  }

  function save() {
    const base = written.current
    const changes: TaskEdit = {}
    if (draft.title !== base.title) changes.title = draft.title
    if (draft.notes !== base.notes) changes.notes = draft.notes
    // срок снимается пустым полем: у задачи без срока места на сетке нет, и она пропадёт
    if (draft.due !== base.due) changes.due = draft.due || null
    if (Object.keys(changes).length === 0) return

    written.current = { ...draft }
    write(changes)
  }

  useEffect(() => {
    flush.current = save
  })

  function field(key: keyof Draft) {
    return (value: string) => setDraft({ ...draft, [key]: value })
  }

  return (
    <div className="mt-6 flex flex-1 flex-col gap-5">
      <section>
        <label
          htmlFor="task-title"
          className="mb-1.5 block text-[11px] tracking-[0.14em] text-fog-faint uppercase"
        >
          Название
        </label>
        <input
          id="task-title"
          value={draft.title}
          onChange={(input) => field('title')(input.target.value)}
          onBlur={save}
          onKeyDown={(key) => {
            if (key.key === 'Enter') key.currentTarget.blur()
          }}
          placeholder="Без названия"
          className="field w-full px-2 py-1.5 text-sm"
        />
      </section>

      <section>
        <label
          htmlFor="task-due"
          className="mb-1.5 block text-[11px] tracking-[0.14em] text-fog-faint uppercase"
        >
          Срок
        </label>
        <input
          id="task-due"
          type="date"
          value={draft.due}
          onChange={(input) => field('due')(input.target.value)}
          onBlur={save}
          className="field px-2 py-1 text-sm"
        />
        <p className="mt-1.5 text-xs text-fog-faint">
          дата без времени: пустой срок убирает задачу с сетки
        </p>
      </section>

      <section>
        <label className="flex items-center gap-2 text-sm text-fog-muted">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(input) => write({ completed: input.target.checked })}
            className="size-4 accent-accent"
          />
          Выполнена
        </label>
      </section>

      <section>
        <label
          htmlFor="task-notes"
          className="mb-1.5 block text-[11px] tracking-[0.14em] text-fog-faint uppercase"
        >
          Заметки
        </label>
        <textarea
          id="task-notes"
          rows={6}
          value={draft.notes}
          onChange={(input) => field('notes')(input.target.value)}
          onBlur={save}
          placeholder="Пусто"
          className="field w-full resize-y px-2 py-1.5 text-sm"
        />
      </section>

      <p role="status" className="min-h-4 text-xs text-fog-faint">
        {edit.isPending ? 'Записываем…' : 'Правка записывается сама'}
      </p>
      {gone ? (
        <p role="status" className="text-sm text-alarm">
          Задачу успели удалить в Google — правка не записана.
        </p>
      ) : null}
      <Failure error={edit.error} />

      {task.webViewLink ? (
        <div className="mt-auto border-t border-hair pt-4">
          <a
            href={task.webViewLink}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent underline underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-accent-line"
          >
            Открыть задачу в Google
          </a>
        </div>
      ) : null}
    </div>
  )
}
