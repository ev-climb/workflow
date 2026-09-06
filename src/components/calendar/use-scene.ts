'use client'

import { useMemo } from 'react'
import type { Held } from '@/lib/calendar-drag'
import { placeDay, type PlacedEvent } from '@/lib/calendar-layout'
import {
  gridScene,
  stripeScene,
  type GridItem,
  type GridScene,
  type StripeDrag,
  type StripeScene,
} from '@/lib/calendar-scene'
import type { CalendarEventView, CardDueView, TimeBlockView } from '@/lib/calendar-view'
import type { CalendarTask } from '@/server/services/google-tasks'

export type Scene = GridScene &
  StripeScene & {
    /** Разложенные по колонкам блоки, в порядке `days`: колонке остаётся их отрисовать. */
    placed: PlacedEvent<GridItem>[][]
  }

/**
 * Всё, что рисует сетка, посчитанное один раз на изменение данных. Мемо здесь не украшение:
 * перетаскивание переписывает состояние на каждое движение указателя, а раскладка на каждое
 * событие дважды разбирает момент через `Intl.DateTimeFormat` — неделя на сотне событий
 * стоила бы около тысячи разборов на кадр.
 *
 * Полосы и временная сетка считаются порознь: жест по одной не заставляет пересчитывать
 * другую, а тащат всегда что-то одно.
 */
export function useScene(input: {
  days: string[]
  events: CalendarEventView[]
  blocks: TimeBlockView[]
  dues: CardDueView[]
  tasks: CalendarTask[]
  held: Held[]
  heldStripes: StripeDrag[]
}): Scene {
  const { days, events, blocks, dues, tasks, held, heldStripes } = input

  const grid = useMemo(() => gridScene({ events, blocks, held }), [events, blocks, held])
  const bands = useMemo(
    () => stripeScene({ days, events, dues, tasks, held: heldStripes }),
    [days, events, dues, tasks, heldStripes],
  )
  const placed = useMemo(() => days.map((day) => placeDay(grid.items, day)), [days, grid.items])

  return { ...grid, ...bands, placed }
}
