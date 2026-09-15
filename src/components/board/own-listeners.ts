import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import type { SyntheticEvent } from 'react'

/**
 * Слушатели перетаскивания, глухие к событиям из порталов. Панель карточки и меню лежат
 * в DOM вне узла, но по дереву React их нажатия всплывают в него — и выделение текста в
 * описании начинало тащить карточку.
 */
export function ownListeners(listeners: DraggableSyntheticListeners): DraggableSyntheticListeners {
  if (!listeners) return listeners
  return Object.fromEntries(
    Object.entries(listeners).map(([name, handler]) => [
      name,
      (event: SyntheticEvent<HTMLElement>) => {
        if (event.currentTarget.contains(event.target as Node)) handler(event)
      },
    ]),
  )
}
