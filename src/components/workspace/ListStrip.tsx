'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { boardQuery } from '@/lib/board-query'
import type { BoardView } from '@/lib/board-view'

type Props = {
  boardId: string
  /** Лента колонок слота: по ней видно, какой список сейчас на экране. */
  scroller: RefObject<HTMLDivElement | null>
  /**
   * Те же начальные данные, что у доски: чипы стоят в дереве раньше неё, и запрос без них
   * заводился бы пустым — доска свои данные тогда уже не подложила бы.
   */
  initial?: BoardView
  initialAt?: number
}

/**
 * Списки доски чипами над лентой. На телефоне колонка занимает весь экран, и без них не
 * видно, сколько списков дальше и где нужный.
 */
export function ListStrip({ boardId, scroller, initial, initialAt }: Props) {
  const { data } = useQuery({
    ...boardQuery(boardId),
    initialData: initial,
    initialDataUpdatedAt: initialAt,
  })
  const [current, setCurrent] = useState<string | null>(null)
  const strip = useRef<HTMLElement>(null)
  const count = data?.lists.length ?? 0

  useEffect(() => {
    const node = scroller.current
    if (!node) return

    // на экране тот список, чей левый край ближе всех к краю ленты
    const track = () => {
      const edge = node.getBoundingClientRect().left
      let nearest: string | null = null
      let best = Infinity
      for (const column of node.querySelectorAll<HTMLElement>('[data-list]')) {
        const distance = Math.abs(column.getBoundingClientRect().left - edge)
        if (distance < best) {
          best = distance
          nearest = column.dataset.list ?? null
        }
      }
      setCurrent(nearest)
    }

    track()
    node.addEventListener('scroll', track, { passive: true })
    return () => node.removeEventListener('scroll', track)
  }, [scroller, count])

  useEffect(() => {
    strip.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [current])

  function jump(listId: string) {
    scroller.current
      ?.querySelector(`[data-list="${listId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }

  if (!data?.lists.length) return null

  return (
    <nav
      ref={strip}
      aria-label="Списки доски"
      className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] md:hidden"
    >
      {data.lists.map((list) => {
        const over = list.wipLimit !== null && list.cards.length > list.wipLimit
        return (
          <button
            key={list.id}
            type="button"
            aria-pressed={current === list.id}
            onClick={() => jump(list.id)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[11px] border border-hair px-3 text-[12.5px] font-semibold whitespace-nowrap text-fog-muted outline-none aria-pressed:border-accent-line aria-pressed:bg-accent-wash aria-pressed:text-fog focus-visible:ring-1 focus-visible:ring-accent-line"
          >
            {list.title}
            <span
              className={`rounded-md font-mono text-[11px] tabular-nums ${
                over ? 'bg-caution-wash px-1 text-caution' : 'text-fog-dim'
              }`}
            >
              {list.wipLimit === null ? list.cards.length : `${list.cards.length}/${list.wipLimit}`}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
