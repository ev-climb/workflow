'use client'

import { useState } from 'react'
import { useSetCardDue, useSetCardDueDone } from '@/lib/board-mutations'
import { formatDue, isOverdue, moscowParts } from '@/lib/dates'
import { Failure } from './Failure'

type Props = {
  boardId: string
  cardId: string
  dueAt: string | null
  dueHasTime: boolean
  dueDone: boolean
}

type Draft = { date: string; time: string }

/** Дата и время в полях правки — московские: тем же боком срок и показывается. */
function draftOf(dueAt: string | null, hasTime: boolean): Draft {
  if (!dueAt) return { date: moscowParts(new Date().toISOString()).date, time: '' }
  const parts = moscowParts(dueAt)
  return { date: parts.date, time: hasTime ? parts.time : '' }
}

/**
 * Срок карточки: дата, необязательное время и отметка «выполнено». Момент из даты и
 * времени собирает сервис — здесь только поля.
 */
export function CardDue({ boardId, cardId, dueAt, dueHasTime, dueDone }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const setDue = useSetCardDue(boardId, cardId)
  const setDone = useSetCardDueDone(boardId, cardId)
  const overdue = dueAt !== null && isOverdue(dueAt, dueDone, dueHasTime)

  function save() {
    if (!draft?.date) return
    const due = { date: draft.date, time: draft.time || null }
    setDue.mutate(due, { onSuccess: () => setDraft(null) })
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-xs text-neutral-500">Срок</h3>
        {draft ? null : (
          <button
            type="button"
            onClick={() => setDraft(draftOf(dueAt, dueHasTime))}
            className="rounded px-1.5 py-0.5 text-xs text-neutral-500 outline-none hover:bg-neutral-900 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-600"
          >
            {dueAt ? 'Править' : 'Добавить'}
          </button>
        )}
      </div>

      {draft ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              autoFocus
              aria-label="Дата срока"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus-visible:border-neutral-500"
            />
            <input
              type="time"
              aria-label="Время срока"
              value={draft.time}
              onChange={(event) => setDraft({ ...draft, time: event.target.value })}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus-visible:border-neutral-500"
            />
            <span className="text-xs text-neutral-600">время необязательно</span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={setDue.isPending || !draft.date}
              className="rounded bg-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-900 outline-none hover:bg-white focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded px-3 py-1.5 text-sm text-neutral-400 outline-none hover:bg-neutral-900 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-600"
            >
              Отмена
            </button>
            {dueAt ? (
              <button
                type="button"
                onClick={() => setDue.mutate(null, { onSuccess: () => setDraft(null) })}
                className="rounded px-3 py-1.5 text-sm text-neutral-400 outline-none hover:bg-neutral-900 hover:text-red-300 focus-visible:ring-1 focus-visible:ring-neutral-600"
              >
                Убрать
              </button>
            ) : null}
          </div>
        </>
      ) : dueAt ? (
        <label className="flex w-fit cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={dueDone}
            disabled={setDone.isPending}
            onChange={(event) => setDone.mutate(event.target.checked)}
            className="size-3.5 accent-emerald-500"
          />
          <span
            className={`rounded px-1.5 py-0.5 text-sm tabular-nums ${
              overdue
                ? 'bg-red-950 text-red-300'
                : dueDone
                  ? 'text-emerald-400 line-through'
                  : 'text-neutral-200'
            }`}
          >
            {formatDue(dueAt, dueHasTime)}
          </span>
        </label>
      ) : (
        <p className="text-sm text-neutral-600">нет</p>
      )}

      <Failure error={setDue.error ?? setDone.error} className="pt-1" />
    </section>
  )
}
