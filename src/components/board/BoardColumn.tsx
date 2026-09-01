'use client'

import { useState } from 'react'
import { useArchiveList, useCreateCard, useRenameList } from '@/lib/board-mutations'
import type { ListView } from '@/lib/board-view'
import { ArchiveButton } from './ArchiveButton'
import { BoardCard } from './BoardCard'
import { Composer } from './Composer'
import { Failure } from './Failure'
import { TitleField } from './TitleField'

export function BoardColumn({ boardId, list }: { boardId: string; list: ListView }) {
  const [renaming, setRenaming] = useState(false)
  const rename = useRenameList(boardId, list.id)
  const create = useCreateCard(boardId, list.id)
  const archive = useArchiveList(boardId, list.id)

  // лимит превышен — счётчик подсвечен, но ничего не запрещено: это сигнал, а не запрет
  const over = list.wipLimit !== null && list.cards.length > list.wipLimit

  return (
    <section className="group/list flex max-h-full w-72 shrink-0 flex-col rounded-lg bg-neutral-900/60">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2">
        {renaming ? (
          <TitleField
            initial={list.title}
            label="Название списка"
            onSubmit={(title) => rename.mutate(title)}
            onClose={() => setRenaming(false)}
            className="min-w-0 flex-1 rounded bg-neutral-800 px-1 text-sm leading-snug font-medium text-neutral-100"
          />
        ) : (
          <h3
            onDoubleClick={() => setRenaming(true)}
            title="Двойной клик — переименовать"
            className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-200"
          >
            {list.title}
          </h3>
        )}
        <span
          title={list.wipLimit === null ? 'Карточек в списке' : `Лимит списка — ${list.wipLimit}`}
          className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
            over ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-500'
          }`}
        >
          {list.wipLimit === null ? list.cards.length : `${list.cards.length}/${list.wipLimit}`}
        </span>
        {/* карточки списка уезжают в архив вместе с ним: сколько именно — видно в подсказке */}
        <ArchiveButton
          label={`Список в архив${list.cards.length ? `, карточек внутри: ${list.cards.length}` : ''}`}
          disabled={archive.isPending}
          onClick={() => archive.mutate()}
          className="group-hover/list:opacity-100"
        />
      </header>

      <Failure error={rename.error ?? create.error ?? archive.error} />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {list.cards.map((card) => (
          <BoardCard key={card.id} boardId={boardId} card={card} />
        ))}
      </div>

      <footer className="shrink-0 px-2 pb-2">
        <Composer
          action="Карточка"
          label="Заголовок новой карточки"
          onAdd={(title) => create.mutate(title)}
        />
      </footer>
    </section>
  )
}
