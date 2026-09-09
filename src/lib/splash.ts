/**
 * Пол времени заставки. Стол собирается за десятки миллисекунд, и без пола фирменный
 * экран успевает только мигнуть.
 */
const SPLASH_MIN_MS = 3_000

/** Запускать в начале серверного компонента, дожидаться перед возвратом разметки. */
export function splashFloor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SPLASH_MIN_MS))
}
