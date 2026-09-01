'use client'

import { useState } from 'react'
import { useDescribeCard } from '@/lib/board-mutations'
import { renderMarkdown } from '@/lib/markdown'
import { Failure } from './Failure'

type Props = { boardId: string; cardId: string; description: string | null }

/**
 * Описание: просмотр отрисованного Markdown и правка исходника. Разметка вставляется
 * как html, но `renderMarkdown` не выпускает наружу ни одного тега из самого текста —
 * проверка на это лежит в `markdown.test.ts`.
 */
export function CardDescription({ boardId, cardId, description }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const describe = useDescribeCard(boardId, cardId)
  const editing = draft !== null

  function save() {
    if (draft === null) return
    if (draft.trim() === (description ?? '').trim()) {
      setDraft(null)
      return
    }
    describe.mutate(draft, { onSuccess: () => setDraft(null) })
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-xs text-neutral-500">Описание</h3>
        {editing ? null : (
          <button
            type="button"
            onClick={() => setDraft(description ?? '')}
            className="rounded px-1.5 py-0.5 text-xs text-neutral-500 outline-none hover:bg-neutral-900 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-600"
          >
            {description ? 'Править' : 'Добавить'}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            autoFocus
            rows={10}
            spellCheck={false}
            aria-label="Описание карточки"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(null)
                return
              }
              // Enter в Markdown — перенос строки, поэтому сохраняет только с модификатором
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                save()
              }
            }}
            className="w-full resize-y rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 font-mono text-sm leading-relaxed text-neutral-100 outline-none focus-visible:border-neutral-500"
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={describe.isPending}
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
            <span className="text-xs text-neutral-600">Ctrl+Enter сохраняет</span>
          </div>
        </>
      ) : description ? (
        <div
          className="markdown text-sm text-neutral-200"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }}
        />
      ) : (
        <p className="text-sm text-neutral-600">пусто</p>
      )}

      <Failure error={describe.error} className="pt-1" />
    </section>
  )
}
