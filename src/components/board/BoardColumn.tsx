'use client'

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import {
  useArchiveList,
  useCreateCard,
  useHighlightList,
  useRenameList,
} from '@/lib/board-mutations'
import { dragId, type DragData } from '@/lib/board-move'
import type { ListView } from '@/lib/board-view'
import type { BoardSummary } from '@/server/services/boards'
import { BoardCard } from './BoardCard'
import { Composer } from './Composer'
import { Failure } from './Failure'
import { ListMenu } from './ListMenu'
import { TitleField } from './TitleField'

type Props = { boards: BoardSummary[]; boardId: string; slot: string; list: ListView }

export function BoardColumn({ boards, boardId, slot, list }: Props) {
  const [renaming, setRenaming] = useState(false)
  const rename = useRenameList(boardId, list.id)
  const create = useCreateCard(boardId, list.id)
  const archive = useArchiveList(boardId, list.id)
  const highlight = useHighlightList(boardId, list.id)

  // список и таскают за шапку, и служит целью для карточки: узел один, роли две
  const data: DragData = { type: 'list', boardId, listId: list.id, list }
  const drag = useSortable({ id: dragId(slot, 'list', list.id), data, disabled: renaming })

  // лимит превышен — счётчик подсвечен, но ничего не запрещено: это сигнал, а не запрет
  const over = list.wipLimit !== null && list.cards.length > list.wipLimit

  return (
    <section
      ref={drag.setNodeRef}
      style={{ transform: CSS.Translate.toString(drag.transform), transition: drag.transition }}
      className={`surface-column group/list flex max-h-full w-72 shrink-0 flex-col p-3.5 ${
        // место списка остаётся видимым: под курсором его рисует накладка
        drag.isDragging ? 'opacity-30' : ''
      } ${list.highlighted ? 'surface-column-lit' : ''} ${
        drag.isOver ? 'surface-column-target' : ''
      }`}
    >
      <header
        ref={drag.setActivatorNodeRef}
        {...drag.attributes}
        {...(renaming ? {} : drag.listeners)}
        className="flex shrink-0 cursor-grab items-center gap-2 rounded-lg px-1 pb-2.5 outline-none focus-visible:ring-1 focus-visible:ring-accent-line"
      >
        {renaming ? (
          <TitleField
            initial={list.title}
            label="Название списка"
            onSubmit={(title) => rename.mutate(title)}
            onClose={() => setRenaming(false)}
            className="min-w-0 flex-1 rounded-lg bg-white/10 px-1.5 text-sm leading-snug font-medium text-fog"
          />
        ) : (
          <h3
            onDoubleClick={() => setRenaming(true)}
            title="Двойной клик — переименовать"
            className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px] font-semibold text-fog"
          >
            {list.highlighted ? (
              <span className="pulse block size-1.5 shrink-0 rounded-full bg-[oklch(0.75_0.15_300)] shadow-[0_0_10px_oklch(0.75_0.15_300)]" />
            ) : null}
            <span className="truncate">{list.title}</span>
          </h3>
        )}
        <span
          title={list.wipLimit === null ? 'Карточек в списке' : `Лимит списка — ${list.wipLimit}`}
          className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
            over ? 'bg-caution-wash text-caution' : 'text-fog-dim'
          }`}
        >
          {list.wipLimit === null ? list.cards.length : `${list.cards.length}/${list.wipLimit}`}
        </span>
        {/* карточки списка уезжают в архив вместе с ним: сколько именно — видно в строке меню */}
        <ListMenu
          highlighted={list.highlighted}
          archiving={archive.isPending}
          archiveLabel={`В архив${list.cards.length ? ` с карточками: ${list.cards.length}` : ''}`}
          onRename={() => setRenaming(true)}
          onHighlight={() => highlight.mutate(!list.highlighted)}
          onArchive={() => archive.mutate()}
          className="group-hover/list:opacity-100"
        />
      </header>

      <Failure error={rename.error ?? create.error ?? highlight.error ?? archive.error} />

      <div
        className={`${
          // пустой список тоже должен быть целью: без высоты в него нечем попасть
          list.cards.length ? 'min-h-0' : 'min-h-12'
        } flex-1 space-y-2.5 overflow-y-auto rounded-xl pr-0.5`}
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

      <footer className="shrink-0 pt-2.5">
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
