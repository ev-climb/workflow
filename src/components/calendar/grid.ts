import type { CalendarEventView } from '@/lib/calendar-view'

export const HOUR_PX = 46
export const DAY_PX = HOUR_PX * 24

/** Рейка со временем слева от колонок. */
export const RAIL = 'w-8 shrink-0'

/** Ниже блок читается только как полоса цвета: время в нём уже не помещается. */
export const TIME_VISIBLE_PX = 28

/** Ниже блока не хватает на две ручки: остаётся нижняя, за верхний край он не тянется. */
export const BOTH_HANDLES_PX = 20

export function columns(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`
}

// часовая разметка фоном, а не строками: 24 пустых div на каждый день сетке не нужны
export const HOUR_LINES = `repeating-linear-gradient(
  to bottom,
  rgb(255 255 255 / 0.05) 0 1px,
  transparent 1px ${HOUR_PX}px
)`

/** Ссылка в карточку: страница стола открывает её на серверной отрисовке, см. `DueStripe`. */
export const cardHref = (cardId: string) => `/?card=${cardId}`

/** Метка ряда полос: жест находит по ней свой ряд, чтобы взять день по его колонкам. */
export const DAY_CELLS = '[data-day-cells]'

export type OpenHandler = (event: CalendarEventView) => void

/** Панель задачи открывается и с полосы, и с зеркала на сетке: у зеркала своей строки нет. */
export type TaskOpenHandler = (task: { id: string; title: string | null }) => void
