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
        className="shrink-0 text-[12.5px] text-fog-dim transition-colors hover:text-fog"
      >
        Настройки
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
