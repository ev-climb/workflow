'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { sendJson } from '@/lib/api-client'
import type { GoogleAccountSummary } from '@/server/services/google-accounts'
import { ColorChoice } from './ColorChoice'

/**
 * Цвет аккаунта: им красятся все его события, поэтому рабочие и личные различимы на
 * сетке с одного взгляда. Смена цвета снимает выбор с календарей аккаунта — это делает
 * сервис, поэтому страница после правки перечитывается целиком.
 */
export function AccountColor({ account }: { account: GoogleAccountSummary }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const save = (color: string | null) => {
    if (color === null) return
    setError(null)
    sendJson('PATCH', `/api/google/accounts/${account.id}`, { color })
      .then(() => startTransition(() => router.refresh()))
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
