import { InvalidInputError } from './errors.ts'

/** Столько же, сколько в колонках `title` схемы. */
export const TITLE_MAX = 512

/**
 * Заголовок доски, списка, карточки, чек-листа, пункта или директории. `what` попадает
 * в текст ошибки — она уходит пользователю, и по ней должно быть видно, что он правил.
 */
export function title(raw: string, what: string): string {
  const value = raw.trim()
  if (!value) throw new InvalidInputError(`${what}: заголовок пустой`)
  if (value.length > TITLE_MAX) {
    throw new InvalidInputError(`${what}: заголовок длиннее ${TITLE_MAX} символов`)
  }
  return value
}
