'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog, VisuallyHidden } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { useRenameCard } from '@/lib/board-mutations'
import { cardQuery } from '@/lib/card-query'
import { formatMoment, isOverdue } from '@/lib/dates'
import { CardChecklists } from './CardChecklists'
import { CardDescription } from './CardDescription'
import { CardLabels } from './CardLabels'
import { Failure } from './Failure'
import { TitleField } from './TitleField'

type Props = { boardId: string; cardId: string; title: string; onClose: () => void }

/**
 * Карточка изнутри. Панель выезжает справа поверх стола и не меняет маршрут: доски
 * остаются на экране, а перетаскивание не сбрасывается перерисовкой страницы.
 * Заголовок известен заранее, из доски, — пока карточка читается, шапке есть что
 * показать, и у диалога всегда есть имя.
 */
export function CardPanel({ boardId, cardId, title, onClose }: Props) {
  const { data, error, isPending } = useQuery(cardQuery(cardId))
  const [renaming, setRenaming] = useState(false)
  const [dragging, setDragging] = useState(false)
  const rename = useRenameCard(boardId, cardId)
  const overdue = data?.dueAt != null && isOverdue(data.dueAt, data.dueDone)
  const heading = data?.title ?? title

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        {/* доски должны просвечивать: накладка притеняет стол, но не закрывает его */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            // Radix слушает Escape на документе в захвате, погасить его всплытием нельзя.
            // Внутри поля Escape отменяет правку, под курсором — перетаскивание пункта;
            // панель закрывает только Escape снаружи.
            if (dragging || document.activeElement?.tagName === 'TEXTAREA') event.preventDefault()
          }}
          className="fixed top-0 right-0 z-50 flex h-full w-112 max-w-[calc(100vw-3rem)] flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 shadow-xl outline-none"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {renaming ? (
                <>
                  {/* диалог обязан сохранять имя и на время правки: заголовок уехал в поле */}
                  <VisuallyHidden.Root asChild>
                    <Dialog.Title>{heading}</Dialog.Title>
                  </VisuallyHidden.Root>
                  <TitleField
                    initial={heading}
                    label="Заголовок карточки"
                    onSubmit={(next) => rename.mutate(next)}
                    onClose={() => setRenaming(false)}
                    className="w-full rounded bg-neutral-800 px-1 text-base leading-snug font-medium text-neutral-100"
                  />
                </>
              ) : (
                <Dialog.Title className="text-base leading-snug font-medium text-neutral-100">
                  <button
                    type="button"
                    onClick={() => setRenaming(true)}
                    title="Переименовать"
                    className="w-full rounded px-1 text-left outline-none hover:bg-neutral-900 focus-visible:ring-1 focus-visible:ring-neutral-600"
                  >
                    {heading}
                  </button>
                </Dialog.Title>
              )}
              <Dialog.Description className="mt-1 truncate text-xs text-neutral-500">
                {data ? `${data.boardTitle} › ${data.listTitle}` : 'Читаем карточку…'}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Закрыть"
              className="rounded px-1.5 text-neutral-500 outline-none hover:bg-neutral-900 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-600"
            >
              ✕
            </Dialog.Close>
          </div>

          <Failure error={rename.error} className="pt-2" />

          {error ? (
            <p role="status" className="mt-6 text-sm text-red-300">
              Карточка не прочиталась: {error.message}
            </p>
          ) : isPending ? null : (
            <div className="mt-6 space-y-5">
              <CardLabels boardId={boardId} cardId={cardId} labels={data.labels} />

              {data.dueAt ? (
                <Field name="Срок">
                  <p
                    className={`inline-block rounded px-1.5 py-0.5 text-sm tabular-nums ${
                      overdue
                        ? 'bg-red-950 text-red-300'
                        : data.dueDone
                          ? 'text-emerald-400 line-through'
                          : 'text-neutral-200'
                    }`}
                  >
                    {formatMoment(data.dueAt)}
                  </p>
                </Field>
              ) : null}

              <CardDescription boardId={boardId} cardId={cardId} description={data.description} />

              <CardChecklists boardId={boardId} cardId={cardId} onDragging={setDragging} />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs text-neutral-500">{name}</h3>
      {children}
    </section>
  )
}
