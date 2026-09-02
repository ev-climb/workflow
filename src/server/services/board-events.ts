import { EventEmitter } from 'node:events'

export type BoardChanged = { boardId: string }

const BOARD = 'board-changed'
const CALENDAR = 'calendar-changed'

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
  bus.emit(BOARD, { boardId } satisfies BoardChanged)
}

/**
 * Сигнал «события календаря перечитать». Без календаря в теле: сетка показывает окно из
 * нескольких календарей разом и перечитывает его целиком, а не по одному.
 */
export function publishCalendarChanged(): void {
  bus.emit(CALENDAR)
}

/** Возвращает отписку: поток SSE обязан позвать её при обрыве, иначе слушатели копятся. */
export function subscribeBoardChanged(listener: (event: BoardChanged) => void): () => void {
  return subscribe(BOARD, listener)
}

export function subscribeCalendarChanged(listener: () => void): () => void {
  return subscribe(CALENDAR, listener)
}

function subscribe<T>(channel: string, listener: (event: T) => void): () => void {
  // сорвавшийся слушатель не должен ронять ни соседей, ни мутацию, пославшую событие
  const guarded = (event: T) => {
    try {
      listener(event)
    } catch {
      // поток мог закрыться между событием и записью в него
    }
  }

  bus.on(channel, guarded)
  return () => {
    bus.off(channel, guarded)
  }
}
