import { useSyncExternalStore } from 'react'

const PHONE = '(width < 48rem)'

/** Палец вместо мыши: наведения нет, двойной клик не в ходу. */
export function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * Узкий экран — та же граница, что у `max-md:`. Раскладку переключает CSS, хук нужен
 * только поведению: на сервере экрана нет, и первая отрисовка идёт как на ноутбуке.
 */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false)
}
