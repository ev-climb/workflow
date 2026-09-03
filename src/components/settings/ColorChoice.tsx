'use client'

import { Select } from 'radix-ui'
import { CALENDAR_COLORS, calendarColorName } from '@/lib/calendar-colors'

type Props = {
  value: string | null
  label: string
  /** Цвет, которым красится календарь без своего: строка «как у аккаунта» и её образец. */
  inherited?: string
  onChange: (color: string | null) => void
}

const INHERIT = 'inherit'

/** Цвет из Google в наборе не значится, поэтому он добавлен в список отдельной строкой. */
export function ColorChoice({ value, label, inherited, onChange }: Props) {
  const known = value === null || CALENDAR_COLORS.some((color) => color.hex === value)
  const options = known
    ? CALENDAR_COLORS
    : [{ hex: value, name: calendarColorName(value) }, ...CALENDAR_COLORS]

  const swatch = value ?? inherited ?? null
  const name = value === null ? 'как у аккаунта' : calendarColorName(value)

  return (
    <Select.Root
      value={value ?? INHERIT}
      onValueChange={(next) => onChange(next === INHERIT ? null : next)}
    >
      <Select.Trigger
        aria-label={label}
        className="field flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs"
      >
        <Swatch color={swatch} />
        <span className="w-28 truncate text-left">{name}</span>
        <Select.Icon className="text-fog-dim">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-64 overflow-hidden surface-menu"
        >
          <Select.Viewport className="p-1">
            {inherited !== undefined ? (
              <Select.Item
                value={INHERIT}
                className="menu-item flex items-center gap-2 px-2 py-1 text-sm"
              >
                <Swatch color={inherited} />
                <Select.ItemText>как у аккаунта</Select.ItemText>
              </Select.Item>
            ) : null}
            {options.map((color) => (
              <Select.Item
                key={color.hex}
                value={color.hex}
                className="menu-item flex items-center gap-2 px-2 py-1 text-sm"
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

function Swatch({ color }: { color: string | null }) {
  return (
    <span
      className={`h-2 w-5 shrink-0 rounded-full ${color ? '' : 'border border-dashed border-hair'}`}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}
