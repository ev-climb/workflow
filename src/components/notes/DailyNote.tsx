'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { dailyNoteQuery } from '@/lib/notes-query'
import { DailyStats } from './DailyStats'
import { NoteEditor } from './NoteEditor'
import { NoteItems } from './NoteItems'

/**
 * Список «Сегодня» над заметками. Не таскается и не уходит в архив: он один и нужен каждый
 * день. Правится как любой список, но отметки в нём держатся до конца дня, а закрытый
 * целиком день красит своё число над сеткой календаря.
 */
export function DailyNote() {
  const [editing, setEditing] = useState(false)
  const daily = useQuery(dailyNoteQuery)
  const note = daily.data

  if (!note) return <Failure error={daily.error} className="px-[18px] pt-2" />

  const done = note.items.filter((item) => item.done).length
  const complete = note.items.length > 0 && done === note.items.length

  return (
    <section aria-label="Сегодня" className="px-[18px] pt-3.5">
      <div
        role={editing ? undefined : 'button'}
        tabIndex={editing ? undefined : 0}
        onClick={() => !editing && setEditing(true)}
        className={`surface-note surface-note-list flex flex-col gap-3 p-[15px] text-left outline-none ${
          editing ? '' : 'surface-note-lift cursor-pointer'
        }`}
      >
        {editing ? (
          <NoteEditor note={note} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <p className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-[-0.01em] text-fog">
                {note.title ?? 'Сегодня'}
              </p>
              <DailyStats />
              <span
                className={`shrink-0 font-mono text-[10px] tracking-[0.06em] tabular-nums ${
                  complete ? 'text-done' : 'text-fog-dim'
                }`}
              >
                {done}/{note.items.length}
              </span>
            </div>

            {note.items.length ? (
              <div className={`note-progress ${complete ? 'note-progress-done' : ''}`}>
                <span style={{ width: `${Math.round((done / note.items.length) * 100)}%` }} />
              </div>
            ) : (
              <p className="text-[13px] text-fog-dim">Пунктов нет — щёлкни, чтобы добавить.</p>
            )}

            <NoteItems items={note.items} editing={false} />
          </>
        )}
      </div>
    </section>
  )
}
