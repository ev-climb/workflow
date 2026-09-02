'use client'

import { DropdownMenu } from 'radix-ui'

const ITEM =
  'menu-item px-2 py-1 text-sm'

type Props = {
  archiving: boolean
  onOpen: () => void
  onTransfer: () => void
  onCopyLink: () => void
  onArchive: () => void
  className?: string
}

/**
 * Меню карточки. Как и кнопка архива у списка, прячется до наведения, но остаётся
 * в потоке табуляции: с клавиатуры её видно по фокусу. Через «Открыть» панель карточки
 * достижима без мыши: пробел и Enter на самой карточке заняты перетаскиванием.
 */
export function CardMenu({
  archiving,
  onOpen,
  onTransfer,
  onCopyLink,
  onArchive,
  className = '',
}: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Меню карточки"
        title="Меню карточки"
        className={`btn-quiet px-1.5 text-xs leading-none opacity-0 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-accent-line data-[state=open]:opacity-100 ${className}`}
      >
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="surface-menu z-50 min-w-52 p-1"
        >
          <DropdownMenu.Item className={ITEM} onSelect={onOpen}>
            Открыть
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} onSelect={onTransfer}>
            Перенести на другую доску…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} onSelect={onCopyLink}>
            Скопировать ссылку
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} disabled={archiving} onSelect={onArchive}>
            В архив
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
