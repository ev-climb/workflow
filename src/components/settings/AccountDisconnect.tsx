'use client'

import { useState } from 'react'
import type { GoogleAccountView } from '@/lib/calendar-view'
import { useDisconnectAccount } from '@/lib/settings-mutations'

/**
 * Отключение аккаунта в два шага: события и задачи уходят с сетки вместе с ним, а
 * доступ отзывается в Google — вернуть аккаунт можно только новым согласием.
 */
export function AccountDisconnect({ account }: { account: GoogleAccountView }) {
  const [confirming, setConfirming] = useState(false)
  const disconnect = useDisconnectAccount(account.id)

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => disconnect.mutate(undefined)}
            disabled={disconnect.isPending}
            className="btn-quiet px-2 py-1 text-xs text-alarm hover:bg-alarm-wash"
          >
            Отключить насовсем
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="btn-quiet px-2 py-1 text-xs"
          >
            Не надо
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Отключить аккаунт ${account.email}`}
          className="btn-quiet px-2 py-1 text-xs hover:text-alarm!"
        >
          Отключить
        </button>
      )}
      {disconnect.error ? (
        <p role="status" className="text-xs text-alarm">
          Не отключился: {disconnect.error.message}
        </p>
      ) : null}
    </div>
  )
}
