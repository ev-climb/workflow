'use client'

import { useEffect, useRef, useState } from 'react'
import { MINUTES_IN_DAY, nowOffset } from '@/lib/calendar-grid'
import { DAY_PX } from './grid'

const TICK_MS = 30_000

/** Доля высоты, на которой хочется видеть текущее время после открытия. */
const SCROLL_ANCHOR = 0.35

/** Текущий момент с шагом в полминуты. На сервере его нет: отрисуй — и разметка разойдётся. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return now
}

/**
 * Первая прокрутка к текущему времени, дальше сетку не дёргаем: человек прокрутил её сам,
 * и возвращать его к «сейчас» каждые полминуты нельзя.
 */
export function useFirstScroll(
  box: React.RefObject<HTMLDivElement | null>,
  days: string[],
  now: Date | null,
): void {
  const scrolled = useRef(false)

  useEffect(() => {
    const node = box.current
    if (!node || scrolled.current || now === null) return

    scrolled.current = true
    const minutes = nowOffset(days, now)?.minutes ?? 9 * 60
    node.scrollTop = (minutes / MINUTES_IN_DAY) * DAY_PX - node.clientHeight * SCROLL_ANCHOR
  }, [box, days, now])
}
