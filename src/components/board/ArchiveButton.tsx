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
      className={`btn-quiet px-1.5 text-xs leading-none opacity-0 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-accent-line ${className}`}
    >
      ↓
    </button>
  )
}
