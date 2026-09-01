'use client'

type Props = {
  label: string
  disabled?: boolean
  onClick: () => void
  className?: string
}

/**
 * Кнопка «в архив». Прячется, пока на элемент не навели мышью, но остаётся в потоке
 * табуляции: с клавиатуры её видно по фокусу.
 */
export function ArchiveButton({ label, disabled = false, onClick, className = '' }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-1 text-xs leading-none text-neutral-500 opacity-0 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-neutral-600 ${className}`}
    >
      ↓
    </button>
  )
}
