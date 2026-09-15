'use client'

import type { ReactNode } from 'react'

export type Tab = 'calendar' | 'top' | 'bottom' | 'notes'

type Props = {
  tab: Tab
  /** Названия досок в слотах. */
  top: string
  bottom: string
  onChange: (tab: Tab) => void
}

const ICON = {
  width: 22,
  height: 22,
  viewBox: '0 0 22 22',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Разделы стола на телефоне: календарь, две доски и заметки занимают экран по очереди. */
export function MobileNav({ tab, top, bottom, onChange }: Props) {
  const items: { value: Tab; label: string; icon: ReactNode }[] = [
    { value: 'calendar', label: 'Календарь', icon: <CalendarIcon /> },
    { value: 'top', label: top, icon: <BoardIcon /> },
    { value: 'bottom', label: bottom, icon: <BoardIcon /> },
    { value: 'notes', label: 'Заметки', icon: <NotesIcon /> },
  ]

  return (
    <nav
      aria-label="Разделы стола"
      className="grid shrink-0 grid-cols-4 border-t border-white/8 bg-ink-deep/80 px-1.5 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={tab === item.value}
          onClick={() => onChange(item.value)}
          className="group relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold text-fog-dim outline-none aria-pressed:text-fog focus-visible:ring-1 focus-visible:ring-accent-line focus-visible:ring-inset"
        >
          <span className="absolute top-0 hidden h-0.5 w-[22px] rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)] group-aria-pressed:block" />
          <span className="group-aria-pressed:text-accent">{item.icon}</span>
          <span className="max-w-full truncate">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function CalendarIcon() {
  return (
    <svg aria-hidden {...ICON}>
      <rect x="3" y="4.5" width="16" height="14" rx="3" />
      <path d="M3 9h16M7.5 2.5v3M14.5 2.5v3" />
    </svg>
  )
}

function BoardIcon() {
  return (
    <svg aria-hidden {...ICON}>
      <rect x="3" y="3.5" width="4.5" height="15" rx="1.5" />
      <rect x="8.75" y="3.5" width="4.5" height="10" rx="1.5" />
      <rect x="14.5" y="3.5" width="4.5" height="12.5" rx="1.5" />
    </svg>
  )
}

function NotesIcon() {
  return (
    <svg aria-hidden {...ICON}>
      <path d="M5 3h9l4 4v12H5z" />
      <path d="M8.5 11h6M8.5 14.5h4" />
    </svg>
  )
}
