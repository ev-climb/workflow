'use client'

import { RATIO_MAX, RATIO_MIN } from '@/lib/split-ratio'

const STEP = 0.02

type Props = {
  ratio: number
  /** Абсолютная координата курсора: в долю высоты её переводит владелец области. */
  onDragTo: (clientY: number) => void
  onStep: (delta: number) => void
}

export function Splitter({ ratio, onDragTo, onStep }: Props) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-label="Граница между досками"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(RATIO_MIN * 100)}
      aria-valuemax={Math.round(RATIO_MAX * 100)}
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onDragTo(event.clientY)
      }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowUp' ? -STEP : event.key === 'ArrowDown' ? STEP : 0
        if (!delta) return
        event.preventDefault()
        onStep(delta)
      }}
      className="group flex cursor-row-resize touch-none items-center outline-none select-none"
    >
      <div className="h-px w-full bg-neutral-800 transition-colors group-hover:bg-neutral-600 group-focus:h-0.5 group-focus:bg-neutral-500 group-active:bg-neutral-500" />
    </div>
  )
}
