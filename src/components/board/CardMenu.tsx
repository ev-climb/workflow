'use client'

import { DropdownMenu } from 'radix-ui'

const ITEM =
  'cursor-pointer rounded px-2 py-1 text-sm text-neutral-200 outline-none select-none data-[disabled]:text-neutral-600 data-[highlighted]:bg-neutral-800'

type Props = {
  archiving: boolean
  onOpen: () => void
  onTransfer: () => void
  onArchive: () => void
  className?: string
}

/**
 * Меню карточки. Как и кнопка архива у списка, прячется до наведения, но остаётся
 * в потоке табуляции: с клавиатуры её видно по фокусу. Через «Открыть» панель карточки
 * достижима без мыши: пробел и Enter на самой карточке заняты перетаскиванием.
 */
export function CardMenu({ archiving, onOpen, onTransfer, onArchive, className = '' }: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Меню карточки"
        title="Меню карточки"
        className={`rounded px-1 text-xs leading-none text-neutral-500 opacity-0 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-neutral-600 data-[state=open]:opacity-100 ${className}`}
      >
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-52 rounded border border-neutral-800 bg-neutral-900 p-1 shadow-lg"
        >
          <DropdownMenu.Item className={ITEM} onSelect={onOpen}>
            Открыть
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} onSelect={onTransfer}>
            Перенести на другую доску…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} disabled={archiving} onSelect={onArchive}>
            В архив
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
