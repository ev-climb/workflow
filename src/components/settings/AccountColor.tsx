'use client'

import { useState } from 'react'
import { sendJson } from '@/lib/api-client'
import type { GoogleAccountView } from '@/lib/calendar-view'
import { ColorChoice } from './ColorChoice'
import { useSettingsRefresh } from './settings-refresh'

/**
 * Цвет аккаунта: им красятся все его события, поэтому рабочие и личные различимы на
 * сетке с одного взгляда. Смена цвета снимает выбор с календарей аккаунта — это делает
 * сервис, поэтому после правки перечитываются оба списка.
 */
export function AccountColor({ account }: { account: GoogleAccountView }) {
  const refresh = useSettingsRefresh()
  const [error, setError] = useState<string | null>(null)

  const save = (color: string | null) => {
    if (color === null) return
    setError(null)
    sendJson('PATCH', `/api/google/accounts/${account.id}`, { color })
      .then(refresh)
      .catch((failure: Error) => setError(failure.message))
  }

  return (
    <>
      <ColorChoice
        value={account.color}
        label={`Цвет событий аккаунта ${account.email}`}
        onChange={save}
      />
      {error ? <span className="text-xs text-alarm">{error}</span> : null}
    </>
  )
}
