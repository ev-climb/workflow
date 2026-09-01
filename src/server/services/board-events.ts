import { EventEmitter } from 'node:events'

export type BoardChanged = { boardId: string }

const CHANNEL = 'board-changed'

/**
 * Шина висит на globalThis: в dev-режиме модуль пересоздаётся при горячей перезагрузке,
 * и уже открытые потоки SSE остались бы подписаны на выброшенный экземпляр.
 */
const store = globalThis as typeof globalThis & { boardEventBus?: EventEmitter }
const bus = (store.boardEventBus ??= new EventEmitter().setMaxListeners(0))

/**
 * Сигнал «доску пора перечитать». Это подсказка вкладкам, а не часть транзакции:
 * потерянное событие переживается обновлением страницы, поэтому publish ничего не ждёт.
 */
export function publishBoardChanged(boardId: string): void {
  bus.emit(CHANNEL, { boardId } satisfies BoardChanged)
}

/** Возвращает отписку: поток SSE обязан позвать её при обрыве, иначе слушатели копятся. */
export function subscribeBoardChanged(listener: (event: BoardChanged) => void): () => void {
  // сорвавшийся слушатель не должен ронять ни соседей, ни мутацию, пославшую событие
  const guarded = (event: BoardChanged) => {
    try {
      listener(event)
    } catch {
      // поток мог закрыться между событием и записью в него
    }
  }

  bus.on(CHANNEL, guarded)
  return () => {
    bus.off(CHANNEL, guarded)
  }
}
