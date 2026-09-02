'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useArchiveCard, useRenameCard } from '@/lib/board-mutations'
import { dragId, type DragData } from '@/lib/board-move'
import type { CardView } from '@/lib/board-view'
import { formatDue, isOverdue } from '@/lib/dates'
import { labelColor } from '@/lib/label-colors'
import type { BoardSummary } from '@/server/services/boards'
import { CardMenu } from './CardMenu'
import { CardPanel } from './CardPanel'
import { Failure } from './Failure'
import { TitleField } from './TitleField'
import { TransferDialog } from './TransferDialog'

/** Столько ждём второго клика, прежде чем показать панель. */
const DOUBLE_CLICK_MS = 250

/** Столько висит ответ на «скопировать ссылку». */
const COPY_NOTE_MS = 2000

export const CARD_FRAME =
  'rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-left'

/** Вид карточки: тот же и в списке, и под курсором во время перетаскивания. */
export function CardFace({ card, title }: { card: CardView; title: ReactNode }) {
  const overdue = card.dueAt !== null && isOverdue(card.dueAt, card.dueDone, card.dueHasTime)
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
              {formatDue(card.dueAt, card.dueHasTime)}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

type Props = {
  boards: BoardSummary[]
  boardId: string
  slot: string
  listId: string
  card: CardView
}

export function BoardCard({ boards, boardId, slot, listId, card }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [opened, setOpened] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [copied, setCopied] = useState<boolean | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const rename = useRenameCard(boardId, card.id)
  const archive = useArchiveCard(boardId, card.id)
  const linked = useSearchParams().get('card')

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      clearTimeout(copyTimer.current)
    },
    [],
  )

  // адрес с идентификатором карточки открывает её сам: доску под неё подставила страница
  useEffect(() => {
    if (linked === card.id) setOpened(true)
  }, [linked, card.id])

  /** Буфер обмена бывает недоступен — без разрешения или вне защищённого адреса. */
  async function copyLink() {
    let done = true
    try {
      await navigator.clipboard.writeText(`${location.origin}/?card=${card.id}`)
    } catch {
      done = false
    }

    setCopied(done)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(null), COPY_NOTE_MS)
  }

  /**
   * Одиночный клик открывает панель, двойной по заголовку — переименовывает. Открытие
   * отложено на такт двойного клика: иначе первый из двух кликов успевал бы показать
   * панель, и переименование становилось бы недостижимым. Настоящее перетаскивание сюда
   * не долетает — dnd-kit гасит клик, как только сработал порог указателя.
   */
  function open(event: MouseEvent<HTMLElement>) {
    clearTimeout(timer.current)
    if (renaming || event.detail > 1) return
    if ((event.target as HTMLElement).closest('button, input')) return

    timer.current = setTimeout(() => setOpened(true), DOUBLE_CLICK_MS)
  }

  const data: DragData = { type: 'card', boardId, listId, card }
  const drag = useSortable({ id: dragId(slot, 'card', card.id), data, disabled: renaming })

  return (
    <article
      ref={drag.setNodeRef}
      style={{ transform: CSS.Translate.toString(drag.transform), transition: drag.transition }}
      {...drag.attributes}
      {...(renaming ? {} : drag.listeners)}
      onClick={open}
      className={`group/card relative ${CARD_FRAME} outline-none focus-visible:border-neutral-500 ${
        // место карточки остаётся видимым: под курсором её рисует накладка
        drag.isDragging ? 'opacity-30' : 'hover:border-neutral-700'
      }`}
    >
      <CardMenu
        archiving={archive.isPending}
        onOpen={() => setOpened(true)}
        onTransfer={() => setTransferring(true)}
        onCopyLink={() => void copyLink()}
        onArchive={() => archive.mutate()}
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

      {copied === null ? null : (
        <p role="status" className={`pt-1 text-xs ${copied ? 'text-neutral-400' : 'text-red-300'}`}>
          {copied ? 'Ссылка скопирована' : 'Буфер обмена недоступен'}
        </p>
      )}

      {opened ? (
        <CardPanel
          boardId={boardId}
          cardId={card.id}
          title={card.title}
          onClose={() => setOpened(false)}
        />
      ) : null}

      {transferring ? (
        <TransferDialog
          boards={boards}
          boardId={boardId}
          listId={listId}
          card={card}
          onClose={() => setTransferring(false)}
        />
      ) : null}
    </article>
  )
}
