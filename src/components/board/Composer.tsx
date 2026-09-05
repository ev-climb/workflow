'use client'

import { useState } from 'react'
import { TitleField } from './TitleField'

type Props = {
  action: string
  label: string
  hint?: string
  className?: string
  onAdd: (title: string) => void
}

/** Кнопка, разворачивающаяся в поле заголовка. */
export function Composer({ action, label, hint, className = '', onAdd }: Props) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`ghost-add w-full px-2.5 py-2 text-left text-[12.5px] focus-visible:ring-1 focus-visible:ring-accent-line ${className}`}
      >
        + {action}
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <TitleField
        initial=""
        label={label}
        clearOnSubmit
        onSubmit={onAdd}
        onClose={() => setOpen(false)}
        className="field w-full px-2.5 py-2 text-sm leading-snug"
      />
      {hint ? <p className="px-1 text-[11px] leading-tight text-fog-faint">{hint}</p> : null}
    </div>
  )
}
