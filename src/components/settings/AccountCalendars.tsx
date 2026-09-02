'use client'

import { useRouter } from 'next/navigation'
import { Select } from 'radix-ui'
import { useState, useTransition } from 'react'
import { sendJson } from '@/lib/api-client'
import { CALENDAR_COLORS, calendarColorName } from '@/lib/calendar-colors'
import type { GoogleCalendarSummary } from '@/server/services/google-calendars'

type Patch = { color?: string; visible?: boolean }

/**
 * Календари одного аккаунта: что показывать в колонке и каким цветом. Список приезжает
 * со страницы уже прочитанным, поэтому после правки страница перечитывается целиком —
 * своего кэша здесь нет, TanStack Query живёт на рабочем столе, а не в настройках.
 */
export function AccountCalendars({ calendars }: { calendars: GoogleCalendarSummary[] }) {
  if (calendars.length === 0) {
    return <p className="mt-2 text-xs text-neutral-500">Календарей у аккаунта не нашлось.</p>
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
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = (patch: Patch) => {
    setError(null)
    sendJson('PATCH', `/api/google/calendars/${calendar.id}`, patch)
      .then(() => startTransition(() => router.refresh()))
      .catch((failure: Error) => setError(failure.message))
  }

  const color = calendar.color ?? CALENDAR_COLORS[CALENDAR_COLORS.length - 1].hex

  return (
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={calendar.visible}
        disabled={pending}
        onChange={(event) => save({ visible: event.target.checked })}
        id={`calendar-${calendar.id}`}
        className="size-3.5 shrink-0 accent-neutral-300"
      />
      <label
        htmlFor={`calendar-${calendar.id}`}
        className={`min-w-0 flex-1 truncate text-sm ${
          calendar.visible ? 'text-neutral-200' : 'text-neutral-500'
        }`}
      >
        {calendar.title}
      </label>
      <ColorChoice
        value={color}
        label={`Цвет календаря «${calendar.title}»`}
        onChange={(next) => save({ color: next })}
      />
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </li>
  )
}

type ColorProps = { value: string; label: string; onChange: (color: string) => void }

/** Цвет из Google в наборе не значится, поэтому он добавлен в список отдельной строкой. */
function ColorChoice({ value, label, onChange }: ColorProps) {
  const known = CALENDAR_COLORS.some((color) => color.hex === value)
  const options = known
    ? CALENDAR_COLORS
    : [{ hex: value, name: calendarColorName(value) }, ...CALENDAR_COLORS]

  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        aria-label={label}
        className="flex shrink-0 items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none focus-visible:ring-1 focus-visible:ring-neutral-500"
      >
        <Swatch color={value} />
        <span className="w-24 truncate text-left">{calendarColorName(value)}</span>
        <Select.Icon className="text-neutral-500">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-64 overflow-hidden rounded border border-neutral-800 bg-neutral-900 shadow-lg"
        >
          <Select.Viewport className="p-1">
            {options.map((color) => (
              <Select.Item
                key={color.hex}
                value={color.hex}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-neutral-200 outline-none select-none data-[highlighted]:bg-neutral-800 data-[state=checked]:text-white"
              >
                <Swatch color={color.hex} />
                <Select.ItemText>{color.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function Swatch({ color }: { color: string }) {
  return <span className="h-2 w-5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
}
