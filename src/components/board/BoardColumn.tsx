'use client'

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { useArchiveList, useCreateCard, useRenameList } from '@/lib/board-mutations'
import { dragId, type DragData } from '@/lib/board-move'
import type { ListView } from '@/lib/board-view'
import type { BoardSummary } from '@/server/services/boards'
import { ArchiveButton } from './ArchiveButton'
import { BoardCard } from './BoardCard'
import { Composer } from './Composer'
import { Failure } from './Failure'
import { TitleField } from './TitleField'

type Props = { boards: BoardSummary[]; boardId: string; slot: string; list: ListView }

export function BoardColumn({ boards, boardId, slot, list }: Props) {
  const [renaming, setRenaming] = useState(false)
  const rename = useRenameList(boardId, list.id)
  const create = useCreateCard(boardId, list.id)
  const archive = useArchiveList(boardId, list.id)

  // список и таскают за шапку, и служит целью для карточки: узел один, роли две
  const data: DragData = { type: 'list', boardId, listId: list.id, list }
  const drag = useSortable({ id: dragId(slot, 'list', list.id), data, disabled: renaming })

  // лимит превышен — счётчик подсвечен, но ничего не запрещено: это сигнал, а не запрет
  const over = list.wipLimit !== null && list.cards.length > list.wipLimit

  return (
    <section
      ref={drag.setNodeRef}
      style={{ transform: CSS.Translate.toString(drag.transform), transition: drag.transition }}
      className={`group/list flex max-h-full w-72 shrink-0 flex-col rounded-lg bg-neutral-900/60 ${
        // место списка остаётся видимым: под курсором его рисует накладка
        drag.isDragging ? 'opacity-30' : ''
      }`}
    >
      <header
        ref={drag.setActivatorNodeRef}
        {...drag.attributes}
        {...(renaming ? {} : drag.listeners)}
        className="flex shrink-0 cursor-grab items-center gap-2 px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-neutral-500"
      >
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

      <div
        className={`${
          // пустой список тоже должен быть целью: без высоты в него нечем попасть
          list.cards.length ? 'min-h-0' : 'min-h-12'
        } flex-1 space-y-2 overflow-y-auto rounded px-2 pb-2 ${drag.isOver ? 'bg-neutral-800/40' : ''}`}
      >
        <SortableContext
          items={list.cards.map((card) => dragId(slot, 'card', card.id))}
          strategy={verticalListSortingStrategy}
        >
          {list.cards.map((card) => (
            <BoardCard
              key={card.id}
              boards={boards}
              boardId={boardId}
              slot={slot}
              listId={list.id}
              card={card}
            />
          ))}
        </SortableContext>
      </div>

      <footer className="shrink-0 px-2 pb-2">
        <Composer
          action="Карточка"
          label="Заголовок новой карточки"
          hint="!пятница 18:00 — срок, #метка — метка доски"
          onAdd={(title) => create.mutate(title)}
        />
      </footer>
    </section>
  )
}
