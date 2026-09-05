'use client'

import { useState } from 'react'
import { sendJson } from '@/lib/api-client'
import type { GoogleCalendarSummary } from '@/server/services/google-calendars'
import { ColorChoice } from './ColorChoice'
import { useSettingsRefresh } from './settings-refresh'

type Patch = { color?: string | null; visible?: boolean }

/**
 * Календари одного аккаунта: что показывать в колонке и каким цветом. Список приезжает
 * из панели уже прочитанным, поэтому после правки перечитывает его она же — вместе
 * с сеткой, которая красит события цветом календаря.
 */
export function AccountCalendars({ calendars }: { calendars: GoogleCalendarSummary[] }) {
  if (calendars.length === 0) {
    return <p className="mt-2 text-xs text-fog-dim">Календарей у аккаунта не нашлось.</p>
  }

  return (
    <ul className="mt-2 space-y-1">
      {calendars.map((calendar) => (
        <CalendarRow key={calendar.id} calendar={calendar} />
      ))}
    </ul>
  )
}

function CalendarRow({ calendar }: { calendar: GoogleCalendarSummary }) {
  const refresh = useSettingsRefresh()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const save = (patch: Patch) => {
    setError(null)
    setPending(true)
    sendJson('PATCH', `/api/google/calendars/${calendar.id}`, patch)
      .then(refresh)
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setPending(false))
  }

  return (
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={calendar.visible}
        disabled={pending}
        onChange={(event) => save({ visible: event.target.checked })}
        id={`calendar-${calendar.id}`}
        className="size-3.5 shrink-0 accent-accent"
      />
      <label
        htmlFor={`calendar-${calendar.id}`}
        className={`min-w-0 flex-1 truncate text-sm ${
          calendar.visible ? 'text-fog' : 'text-fog-dim'
        }`}
      >
        {calendar.title}
      </label>
      <ColorChoice
        value={calendar.color}
        inherited={calendar.accountColor ?? undefined}
        label={`Цвет календаря «${calendar.title}»`}
        onChange={(next) => save({ color: next })}
      />
      {error ? <span className="text-xs text-alarm">{error}</span> : null}
    </li>
  )
}
