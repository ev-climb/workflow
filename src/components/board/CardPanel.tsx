'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { cardQuery } from '@/lib/card-query'
import { formatMoment, isOverdue } from '@/lib/dates'
import { labelColor } from '@/lib/label-colors'

type Props = { cardId: string; title: string; onClose: () => void }

/**
 * Карточка изнутри. Панель выезжает справа поверх стола и не меняет маршрут: доски
 * остаются на экране, а перетаскивание не сбрасывается перерисовкой страницы.
 * Заголовок известен заранее, из доски, — пока карточка читается, шапке есть что
 * показать, и у диалога всегда есть имя.
 */
export function CardPanel({ cardId, title, onClose }: Props) {
  const { data, error, isPending } = useQuery(cardQuery(cardId))
  const overdue = data?.dueAt != null && isOverdue(data.dueAt, data.dueDone)

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        {/* доски должны просвечивать: накладка притеняет стол, но не закрывает его */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed top-0 right-0 z-50 flex h-full w-112 max-w-[calc(100vw-3rem)] flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 shadow-xl outline-none">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base leading-snug font-medium text-neutral-100">
                {data?.title ?? title}
              </Dialog.Title>
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

          {error ? (
            <p role="status" className="mt-6 text-sm text-red-300">
              Карточка не прочиталась: {error.message}
            </p>
          ) : isPending ? null : (
            <div className="mt-6 space-y-5">
              {data.labels.length ? (
                <Field name="Метки">
                  <ul className="flex flex-wrap gap-1.5">
                    {data.labels.map((label) => (
                      <li
                        key={label.id}
                        className="flex items-center gap-1.5 rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-300"
                      >
                        <span
                          className="h-1.5 w-4 rounded-full"
                          style={{ backgroundColor: labelColor(label.color) }}
                        />
                        {label.name || 'без названия'}
                      </li>
                    ))}
                  </ul>
                </Field>
              ) : null}

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

              <Field name="Описание">
                {data.description ? (
                  // текст показан как есть: отрисовка Markdown — отдельный пункт фазы
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-neutral-200">
                    {data.description}
                  </p>
                ) : (
                  <p className="text-sm text-neutral-600">пусто</p>
                )}
              </Field>
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
