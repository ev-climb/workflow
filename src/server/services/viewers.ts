/**
 * Сколько вкладок сейчас смотрит на приложение. Считаем по открытым потокам SSE: другого
 * признака присутствия у нас нет, а поток вкладка держит ровно пока живёт страница.
 * Нужно синхронизации — при пустом столе она ходит в Google в десять раз реже.
 */

// счётчик, как и шина событий, висит на globalThis: в dev-режиме модуль пересоздаётся
// при горячей перезагрузке, а уже открытые потоки об этом не знают
const store = globalThis as typeof globalThis & { viewersOnline?: { count: number } }
const state = (store.viewersOnline ??= { count: 0 })

/** Возвращает отписку. Поток SSE обязан позвать её при обрыве, иначе счётчик уползёт. */
export function trackViewer(): () => void {
  state.count += 1
  let released = false

  return () => {
    if (released) return
    released = true
    state.count -= 1
  }
}

export function viewersOnline(): number {
  return state.count
}
