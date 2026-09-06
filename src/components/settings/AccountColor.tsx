'use client'

import { Failure } from '@/components/board/Failure'
import type { GoogleAccountView } from '@/lib/calendar-view'
import { useSetAccountColor } from '@/lib/settings-mutations'
import { ColorChoice } from './ColorChoice'

/**
 * Цвет аккаунта: им красятся все его события, поэтому рабочие и личные различимы на
 * сетке с одного взгляда. Смена цвета снимает выбор с календарей аккаунта — это делает
 * сервис, поэтому после правки перечитываются оба списка.
 */
export function AccountColor({ account }: { account: GoogleAccountView }) {
  const setColor = useSetAccountColor(account.id)

  return (
    <>
      <ColorChoice
        value={account.color}
        label={`Цвет событий аккаунта ${account.email}`}
        disabled={setColor.isPending}
        onChange={(color) => {
          if (color !== null) setColor.mutate(color)
        }}
      />
      <Failure error={setColor.error} />
    </>
  )
}
