'use client'

import { useQuery } from '@tanstack/react-query'
import { Popover } from 'radix-ui'
import { boardQuery } from '@/lib/board-query'
import { labelColor } from '@/lib/label-colors'
import { useToggleCardLabel } from '@/lib/label-mutations'
import type { LabelRef } from '@/server/services/cards'
import { Failure } from './Failure'

type Props = { boardId: string; cardId: string; labels: LabelRef[] }

const chip = 'flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs'

/**
 * Метки карточки: показаны как есть, правятся переключателями из набора доски. Заводится
 * и переименовывается набор в шапке доски — на карточке метка только включается.
 */
export function CardLabels({ boardId, cardId, labels }: Props) {
  const toggle = useToggleCardLabel(boardId, cardId)
  const on = new Set(labels.map((label) => label.id))

  return (
    <section>
      <h3 className="mb-1.5 text-[11px] tracking-[0.14em] text-fog-faint uppercase">Метки</h3>
      <ul className="flex flex-wrap items-center gap-1.5">
        {labels.map((label) => (
          <li key={label.id} className={`${chip} bg-white/6 text-fog-muted`}>
            <Swatch color={label.color} />
            {label.name || 'без названия'}
          </li>
        ))}
        <li>
          <Popover.Root>
            <Popover.Trigger
              aria-label="Выбрать метки карточки"
              className="ghost-add px-2 py-0.5 text-xs"
            >
              {labels.length ? '+' : 'Выбрать'}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={6}
                className="z-50 max-h-72 w-64 overflow-y-auto surface-menu p-1 outline-none"
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

  if (error) return <p className="p-2 text-sm text-fog-dim">Доска не прочиталась.</p>
  if (isPending) return <p className="p-2 text-sm text-fog-dim">Читаем метки…</p>
  if (!data.labels.length) {
    return <p className="p-2 text-sm text-fog-dim">Меток на доске нет — заведи их в шапке.</p>
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
              className="menu-item flex w-full items-center gap-2 px-2 py-1 text-left text-sm"
            >
              <Swatch color={label.color} />
              <span className="min-w-0 flex-1 truncate">{label.name || 'без названия'}</span>
              <span className={checked ? 'text-fog' : 'text-transparent'}>✓</span>
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
      className="h-1 w-8 shrink-0 rounded-full"
      style={{ backgroundColor: labelColor(color) }}
    />
  )
}
