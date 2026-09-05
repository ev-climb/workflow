/** Текст или список дел. Третьего вида заметки не будет: остальное — уже карточка. */
export type NoteKind = 'text' | 'list'

/**
 * Заголовок и остаток текста. Своё поле заметки главнее: заполнено — текст уходит в
 * описание целиком. Пусто — заголовком становится первая непустая строка, а описанием
 * то, что под ней. Так заметка, набранная одним куском, переезжает в карточку не
 * безымянной.
 */
export function splitHeading(
  title: string | null,
  body: string | null,
): { heading: string; rest: string } {
  const text = (body ?? '').trim()
  const own = (title ?? '').trim()
  if (own) return { heading: own, rest: text }

  const at = text.indexOf('\n')
  if (at < 0) return { heading: text, rest: '' }
  return { heading: text.slice(0, at).trim(), rest: text.slice(at + 1).trim() }
}

/** Первая строка заметки для списка в шторке: у списка дел заголовка может не быть вовсе. */
export function noteHeading(note: { title: string | null; body: string | null }): string {
  return splitHeading(note.title, note.body).heading
}
