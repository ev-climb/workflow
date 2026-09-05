'use client'

import { useState } from 'react'
import { Composer } from '@/components/board/Composer'
import { Failure } from '@/components/board/Failure'
import { useAddNoteItem, useUpdateNote } from '@/lib/notes-mutations'
import type { NoteView } from '@/server/services/notes'
import { NoteItems } from './NoteItems'

type Props = { note: NoteView; onDone: () => void }

/**
 * Заметка в правке. Заголовок и текст уходят на сервер по выходу из правки, а не на
 * каждую букву: заметку набирают целыми фразами, и запрос на символ здесь ни к чему.
 * Пункты списка дел живут своей жизнью — они отдельные строки и пишутся сразу, поэтому
 * «Отмена» бросает только заголовок и текст.
 */
export function NoteEditor({ note, onDone }: Props) {
  const [title, setTitle] = useState(note.title ?? '')
  const [body, setBody] = useState(note.body ?? '')
  const update = useUpdateNote(note.id)
  const addItem = useAddNoteItem(note.id)

  function finish() {
    const changed = title !== (note.title ?? '') || body !== (note.body ?? '')
    if (changed) {
      update.mutate(note.kind === 'list' ? { title } : { title, body })
    }
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
        placeholder="Заголовок"
        aria-label="Заголовок заметки"
        className="field w-full px-2.5 py-1.5 text-[14.5px] font-semibold tracking-[-0.01em]"
      />

      {note.kind === 'text' ? (
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          placeholder="Текст заметки"
          aria-label="Текст заметки"
          className="field w-full resize-y px-2.5 py-2 text-[13px] leading-[1.55]"
        />
      ) : (
        <>
          <NoteItems items={note.items} editing />
          <Composer
            action="Новый пункт"
            label="Новый пункт"
            className="ghost-add-cool"
            onAdd={(value) => addItem.mutate(value)}
          />
        </>
      )}

      <Failure error={update.error ?? addItem.error} />

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-quiet px-3 py-1.5 text-xs">
          Отмена
        </button>
        <button
          type="button"
          onClick={finish}
          className="btn-primary rounded-[11px] px-4 py-1.5 text-xs font-semibold"
        >
          Готово
        </button>
      </div>
    </div>
  )
}
