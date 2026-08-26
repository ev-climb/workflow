import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
import { ConflictError, InvalidInputError } from './errors.ts'

/**
 * Ранги упорядочивают доски, списки, карточки, чек-листы и пункты (ADR-001).
 * Сравниваются побайтно: колонки объявлены с `collate "C"`, см. ADR-009.
 */

/**
 * Между двумя соседями. `null` с любой стороны — край коллекции.
 * Соседей, переданных в обратном порядке, `fractional-indexing` молча меняет местами:
 * ранг всё равно окажется между ними, но перепутанный вызов так не всплывёт.
 */
export function rankBetween(prev: string | null, next: string | null): string {
  try {
    return generateKeyBetween(prev, next)
  } catch (cause) {
    throw new InvalidInputError(`ранги идут не по порядку: ${prev} и ${next}`, { cause })
  }
}

/** Перед первым элементом; `null` — коллекция пуста. */
export function rankBefore(first: string | null): string {
  return rankBetween(null, first)
}

/** После последнего элемента; `null` — коллекция пуста. */
export function rankAfter(last: string | null): string {
  return rankBetween(last, null)
}

/** Подряд идущие ранги для наполнения пустой коллекции — импорт, копирование доски. */
export function rankSequence(count: number): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new InvalidInputError(`нужно неотрицательное целое, а не ${count}`)
  }
  return generateNKeysBetween(null, null, count)
}

const CAUSE_DEPTH = 5

/**
 * Уникальный индекс «родитель + ранг» назван `*_rank_key` — по нему и опознаём.
 * Цепочку `cause` разбирать обязательно: drizzle заворачивает ошибку драйвера в свою,
 * и проверка одного верхнего уровня не срабатывает никогда.
 */
export function isRankCollision(error: unknown): boolean {
  let current: unknown = error

  for (let depth = 0; depth < CAUSE_DEPTH; depth++) {
    if (typeof current !== 'object' || current === null) return false

    const { code, constraint_name: constraint } = current as Record<string, unknown>
    if (code === '23505' && typeof constraint === 'string' && constraint.endsWith('_rank_key')) {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }

  return false
}

const RANK_ATTEMPTS = 5

/**
 * Повторяет запись при коллизии ранга. Инвариант 1: перегенерируется один ранг,
 * коллекция не перенумеровывается. `write` обязана каждый раз заново читать соседей —
 * иначе сгенерирует тот же ранг и упрётся в тот же индекс.
 */
export async function withRankRetry<T>(
  write: () => Promise<T>,
  attempts = RANK_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write()
    } catch (error) {
      if (!isRankCollision(error)) throw error
      if (attempt >= attempts) {
        throw new ConflictError(`ранг занят, ${attempts} попыток подряд`, { cause: error })
      }
    }
  }
}
