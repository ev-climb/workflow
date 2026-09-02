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
        <h3 className="text-[11px] tracking-[0.14em] text-fog-faint uppercase">Срок</h3>
        {draft ? null : (
          <button
            type="button"
            onClick={() => setDraft(draftOf(dueAt, dueHasTime))}
            className="btn-quiet px-1.5 py-0.5 text-xs"
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
              className="field px-2 py-1 text-sm"
            />
            <input
              type="time"
              aria-label="Время срока"
              value={draft.time}
              onChange={(event) => setDraft({ ...draft, time: event.target.value })}
              className="field px-2 py-1 text-sm"
            />
            <span className="text-xs text-fog-faint">время необязательно</span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={setDue.isPending || !draft.date}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="btn-quiet px-3 py-1.5 text-sm"
            >
              Отмена
            </button>
            {dueAt ? (
              <button
                type="button"
                onClick={() => setDue.mutate(null, { onSuccess: () => setDraft(null) })}
                className="btn-quiet px-3 py-1.5 text-sm hover:text-alarm!"
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
            className="size-3.5 accent-[oklch(0.72_0.14_168)]"
          />
          <span
            className={`rounded px-1.5 py-0.5 text-sm tabular-nums ${
              overdue
                ? 'bg-alarm-wash text-alarm'
                : dueDone
                  ? 'text-done line-through'
                  : 'text-fog'
            }`}
          >
            {formatDue(dueAt, dueHasTime)}
          </span>
        </label>
      ) : (
        <p className="text-sm text-fog-faint">нет</p>
      )}

      <Failure error={setDue.error ?? setDone.error} className="pt-1" />
    </section>
  )
}
