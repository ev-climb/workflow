'use client'

import { DropdownMenu } from 'radix-ui'

const ITEM = 'menu-item flex items-center gap-1.5 px-2 py-1 text-sm'

type Props = {
  highlighted: boolean
  archiving: boolean
  archiveLabel: string
  onRename: () => void
  onHighlight: () => void
  onArchive: () => void
  className?: string
}

/**
 * Меню списка. Как и меню карточки, прячется до наведения, но остаётся в потоке
 * табуляции. Переименование здесь же: двойной клик по заголовку с клавиатуры недостижим.
 */
export function ListMenu({
  highlighted,
  archiving,
  archiveLabel,
  onRename,
  onHighlight,
  onArchive,
  className = '',
}: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Меню списка"
        title="Меню списка"
        className={`btn-quiet px-1.5 text-xs leading-none opacity-0 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-accent-line data-[state=open]:opacity-100 ${className}`}
      >
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="surface-menu z-50 min-w-52 p-1">
          <DropdownMenu.Item className={ITEM} onSelect={onRename}>
            <Mark />
            Переименовать
          </DropdownMenu.Item>
          <DropdownMenu.CheckboxItem
            className={ITEM}
            checked={highlighted}
            onSelect={(event) => {
              // меню остаётся открытым: галочка встанет, когда доска перечитается
              event.preventDefault()
              onHighlight()
            }}
          >
            <Mark />
            Выделить
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Item className={ITEM} disabled={archiving} onSelect={onArchive}>
            <Mark />
            {archiveLabel}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** Место под галочку одной ширины у всех строк: без него названия разъезжаются. */
function Mark() {
  return (
    <span className="inline-block w-3.5 shrink-0 text-accent">
      <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
    </span>
  )
}
