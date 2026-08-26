'use client'

import { useLayoutEffect, useRef, useState } from 'react'

type Props = {
  initial: string
  label: string
  className?: string
  /** Поле остаётся открытым и пустым после Enter: так подряд заводят несколько штук. */
  clearOnSubmit?: boolean
  onSubmit: (title: string) => void
  onClose: () => void
}

/**
 * Поле заголовка: Enter и уход фокуса сохраняют, Escape отменяет. Пустой ввод и текст,
 * не отличающийся от прежнего, до сервера не доходят.
 */
export function TitleField({
  initial,
  label,
  className = '',
  clearOnSubmit = false,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initial)
  const field = useRef<HTMLTextAreaElement>(null)
  const closed = useRef(false)

  useLayoutEffect(() => {
    field.current?.select()
  }, [])

  // высота по содержимому: длинный заголовок правится целиком, а не в одну строку
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  function close() {
    closed.current = true
    onClose()
  }

  function submit(): boolean {
    const title = value.trim()
    if (!title || (!clearOnSubmit && title === initial.trim())) return false
    onSubmit(title)
    return true
  }

  return (
    <textarea
      ref={field}
      autoFocus
      rows={1}
      spellCheck={false}
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
          return
        }
        if (event.key !== 'Enter' || event.shiftKey) return

        event.preventDefault()
        const sent = submit()
        if (clearOnSubmit && sent) setValue('')
        else close()
      }}
      onBlur={() => {
        // Escape уже закрыл поле: снятие фокуса при размонтировании ничего не сохраняет
        if (closed.current) return
        submit()
        close()
      }}
      className={`resize-none overflow-hidden outline-none ${className}`}
    />
  )
}
