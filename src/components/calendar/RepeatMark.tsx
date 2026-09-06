import type { CalendarEventView } from '@/lib/calendar-view'

/**
 * Экземпляр повторяющегося события. Серию целиком мы не правим (ADR-004), поэтому на блоке
 * это должно читаться до того, как его открыли.
 */
export function RepeatMark() {
  return (
    <span aria-hidden className="shrink-0 font-mono text-[9.5px] leading-none text-white/75">
      ↻
    </span>
  )
}

export function hintOf(event: CalendarEventView, title: string): string {
  return event.recurringEventId ? `${title} (повторяется)` : title
}
