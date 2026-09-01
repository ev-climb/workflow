'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, type ReactNode } from 'react'
import { useArchiveCard, useRenameCard } from '@/lib/board-mutations'
import { dragId, type DragData } from '@/lib/board-move'
import type { CardView } from '@/lib/board-view'
import { formatMoment, isOverdue } from '@/lib/dates'
import { labelColor } from '@/lib/label-colors'
import { ArchiveButton } from './ArchiveButton'
import { Failure } from './Failure'
import { TitleField } from './TitleField'

export const CARD_FRAME =
  'rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-left'

/** Вид карточки: тот же и в списке, и под курсором во время перетаскивания. */
export function CardFace({ card, title }: { card: CardView; title: ReactNode }) {
  const overdue = card.dueAt !== null && isOverdue(card.dueAt, card.dueDone)
  const checklistDone = card.checklistTotal > 0 && card.checklistDone === card.checklistTotal

  return (
    <>
      {card.labels.length ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <span
              key={label.id}
              title={label.name}
              className="h-1.5 w-9 rounded-full"
              style={{ backgroundColor: labelColor(label.color) }}
            />
          ))}
        </div>
      ) : null}

      {title}

      {card.hasDescription || card.checklistTotal > 0 || card.dueAt ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          {card.hasDescription ? <span title="Есть описание">≡</span> : null}
          {card.checklistTotal > 0 ? (
            <span
              title="Чек-лист"
              className={`tabular-nums ${checklistDone ? 'text-emerald-400' : ''}`}
            >
              ☑ {card.checklistDone}/{card.checklistTotal}
            </span>
          ) : null}
          {card.dueAt ? (
            <span
              title={card.dueDone ? 'Срок, отмечен выполненным' : 'Срок'}
              className={`rounded px-1 py-0.5 tabular-nums ${
                overdue
                  ? 'bg-red-950 text-red-300'
                  : card.dueDone
                    ? 'text-emerald-400 line-through'
                    : ''
              }`}
            >
              {formatMoment(card.dueAt)}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

type Props = { boardId: string; slot: string; listId: string; card: CardView }

export function BoardCard({ boardId, slot, listId, card }: Props) {
  const [renaming, setRenaming] = useState(false)
  const rename = useRenameCard(boardId, card.id)
  const archive = useArchiveCard(boardId, card.id)

  const data: DragData = { type: 'card', boardId, listId, card }
  const drag = useSortable({ id: dragId(slot, 'card', card.id), data, disabled: renaming })

  return (
    <article
      ref={drag.setNodeRef}
      style={{ transform: CSS.Translate.toString(drag.transform), transition: drag.transition }}
      {...drag.attributes}
      {...(renaming ? {} : drag.listeners)}
      className={`group/card relative ${CARD_FRAME} outline-none focus-visible:border-neutral-500 ${
        // место карточки остаётся видимым: под курсором её рисует накладка
        drag.isDragging ? 'opacity-30' : 'hover:border-neutral-700'
      }`}
    >
      <ArchiveButton
        label="Карточку в архив"
        disabled={archive.isPending}
        onClick={() => archive.mutate()}
        className="absolute top-1 right-1 bg-neutral-900 group-hover/card:opacity-100"
      />

      <CardFace
        card={card}
        title={
          renaming ? (
            <TitleField
              initial={card.title}
              label="Заголовок карточки"
              onSubmit={(title) => rename.mutate(title)}
              onClose={() => setRenaming(false)}
              className="w-full rounded bg-neutral-800 px-1 text-sm leading-snug text-neutral-100"
            />
          ) : (
            <p
              onDoubleClick={() => setRenaming(true)}
              title="Двойной клик — переименовать"
              className="text-sm leading-snug text-neutral-100"
            >
              {card.title}
            </p>
          )
        }
      />

      <Failure error={rename.error ?? archive.error} className="pt-1" />
    </article>
  )
}
