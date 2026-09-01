'use client'

import { useQuery } from '@tanstack/react-query'
import { Popover } from 'radix-ui'
import { boardQuery } from '@/lib/board-query'
import { labelColor } from '@/lib/label-colors'
import { useToggleCardLabel } from '@/lib/label-mutations'
import type { LabelRef } from '@/server/services/cards'
import { Failure } from './Failure'

type Props = { boardId: string; cardId: string; labels: LabelRef[] }

const chip = 'flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs'

/**
 * Метки карточки: показаны как есть, правятся переключателями из набора доски. Заводится
 * и переименовывается набор в шапке доски — на карточке метка только включается.
 */
export function CardLabels({ boardId, cardId, labels }: Props) {
  const toggle = useToggleCardLabel(boardId, cardId)
  const on = new Set(labels.map((label) => label.id))

  return (
    <section>
      <h3 className="mb-1.5 text-xs text-neutral-500">Метки</h3>
      <ul className="flex flex-wrap items-center gap-1.5">
        {labels.map((label) => (
          <li key={label.id} className={`${chip} bg-neutral-900 text-neutral-300`}>
            <Swatch color={label.color} />
            {label.name || 'без названия'}
          </li>
        ))}
        <li>
          <Popover.Root>
            <Popover.Trigger
              aria-label="Выбрать метки карточки"
              className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-neutral-500 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-600"
            >
              {labels.length ? '+' : 'Выбрать'}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={6}
                className="z-50 max-h-72 w-64 overflow-y-auto rounded border border-neutral-800 bg-neutral-900 p-1 shadow-lg outline-none"
              >
                <Choices boardId={boardId} on={on} onToggle={toggle.mutate} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </li>
      </ul>
      <Failure error={toggle.error} className="pt-1" />
    </section>
  )
}

type ChoicesProps = {
  boardId: string
  on: Set<string>
  onToggle: (input: { labelId: string; on: boolean }) => void
}

/** Набор берётся из уже прочитанной доски — отдельного запроса на метки нет. */
function Choices({ boardId, on, onToggle }: ChoicesProps) {
  const { data, error, isPending } = useQuery(boardQuery(boardId))

  if (error) return <p className="p-2 text-sm text-neutral-500">Доска не прочиталась.</p>
  if (isPending) return <p className="p-2 text-sm text-neutral-500">Читаем метки…</p>
  if (!data.labels.length) {
    return <p className="p-2 text-sm text-neutral-500">Меток на доске нет — заведи их в шапке.</p>
  }

  return (
    <ul>
      {data.labels.map((label) => {
        const checked = on.has(label.id)

        return (
          <li key={label.id}>
            <button
              type="button"
              aria-pressed={checked}
              onClick={() => onToggle({ labelId: label.id, on: !checked })}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-neutral-200 outline-none hover:bg-neutral-800 focus-visible:ring-1 focus-visible:ring-neutral-600"
            >
              <Swatch color={label.color} />
              <span className="min-w-0 flex-1 truncate">{label.name || 'без названия'}</span>
              <span className={checked ? 'text-neutral-200' : 'text-transparent'}>✓</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="h-1.5 w-4 shrink-0 rounded-full"
      style={{ backgroundColor: labelColor(color) }}
    />
  )
}
