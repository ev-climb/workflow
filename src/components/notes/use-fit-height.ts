'use client'

import { useEffect, useRef, useState, type TransitionEvent } from 'react'

/**
 * Высота блока, догоняющая содержимое. `height: auto` рост содержимого не анимирует,
 * поэтому блоку ставится измеренная высота внутренней обёртки, а тянет её CSS-переход.
 * Блоку нужен `box-content`: его отступы к измеренной высоте прибавляются сами.
 *
 * Когда рост закончился, а фокус внутри, поле с фокусом подтягивается в видимую часть
 * прокрутки — иначе очередной пункт списка набирался бы за нижним краем шторки.
 */
export function useFitHeight() {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()

  useEffect(() => {
    const node = inner.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize[0].blockSize))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  function onTransitionEnd(event: TransitionEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'height') return
    const focused = document.activeElement
    if (focused instanceof HTMLElement && event.currentTarget.contains(focused)) {
      focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  return { inner, style: { height }, onTransitionEnd }
}
