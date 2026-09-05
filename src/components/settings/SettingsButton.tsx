'use client'

import { useEffect, useState } from 'react'
import { SettingsDialog } from './SettingsDialog'

type Notice = { connected?: string; error?: string }

/**
 * Вход в настройки из шапки календаря. Возврат из Google приходит переходом на стол с
 * `connected` или `error` в адресе: панель открывается сама и показывает итог, а адрес
 * тут же чистится — перезагрузка страницы не должна показывать то же сообщение снова.
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error = params.get('error')
    if (!connected && !error) return

    setNotice({ connected: connected ?? undefined, error: error ?? undefined })
    setOpen(true)

    params.delete('connected')
    params.delete('error')
    const rest = params.toString()
    window.history.replaceState(null, '', rest ? `?${rest}` : window.location.pathname)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Настройки"
        title="Настройки"
        className="grid size-[30px] shrink-0 place-items-center rounded-[10px] text-fog-dim transition-colors hover:bg-white/7 hover:text-white focus-visible:ring-1 focus-visible:ring-accent-line focus-visible:outline-none"
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open ? (
        <SettingsDialog
          notice={notice}
          onClose={() => {
            setOpen(false)
            setNotice(null)
          }}
        />
      ) : null}
    </>
  )
}
