'use client'

import { useState } from 'react'
import { TitleField } from './TitleField'

type Props = {
  action: string
  label: string
  onAdd: (title: string) => void
}

/** Кнопка, разворачивающаяся в поле заголовка. */
export function Composer({ action, label, onAdd }: Props) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-500 outline-none hover:bg-neutral-800/60 hover:text-neutral-300 focus-visible:ring-1 focus-visible:ring-neutral-600"
      >
        + {action}
      </button>
    )
  }

  return (
    <TitleField
      initial=""
      label={label}
      clearOnSubmit
      onSubmit={onAdd}
      onClose={() => setOpen(false)}
      className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm leading-snug text-neutral-100"
    />
  )
}
