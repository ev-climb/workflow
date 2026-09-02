/**
 * Описание события Google хранится разметкой HTML, а правится у нас обычным текстом:
 * поле в панели — не редактор разметки, и показывать в нём теги нечего.
 *
 * Перевод обратно теряет всё, кроме переводов строк, поэтому описание уходит в Google
 * только тогда, когда его правили: нетронутая ссылка из приглашения на встречу остаётся
 * ссылкой.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
}

/** Разметка описания в текст для поля правки. */
export function descriptionText(html: string | null): string {
  if (html === null) return ''

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Текст из поля обратно в разметку. Пустое описание — отсутствующее, а не пустая строка. */
export function descriptionHtml(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  return trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}
