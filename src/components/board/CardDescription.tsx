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
        <h3 className="text-[11px] tracking-[0.14em] text-fog-faint uppercase">Описание</h3>
        {editing ? null : (
          <button
            type="button"
            onClick={() => setDraft(description ?? '')}
            className="btn-quiet px-1.5 py-0.5 text-xs"
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
            className="field w-full resize-y px-2 py-1.5 font-mono text-sm leading-relaxed"
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={describe.isPending}
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
            <span className="text-xs text-fog-faint">Ctrl+Enter сохраняет</span>
          </div>
        </>
      ) : description ? (
        <div
          className="markdown text-sm text-fog"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }}
        />
      ) : (
        <p className="text-sm text-fog-faint">пусто</p>
      )}

      <Failure error={describe.error} className="pt-1" />
    </section>
  )
}
