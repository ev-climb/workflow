import { Marked, type Tokens } from 'marked'

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

const ESCAPED: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPED[char]!)

/**
 * Схема ссылки. Пробелы и управляющие символы выкусываются до проверки: браузер
 * прочитает `java\tscript:` как схему, а наивное сравнение — как относительный путь.
 * Ссылка без схемы, относительная или якорь, проходит.
 */
function safeHref(href: string): string | null {
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(href.replace(/[\u0000-\u0020]/g, ''))
  return scheme && !SAFE_SCHEMES.has(scheme[0].toLowerCase()) ? null : href
}

const attribute = (name: string, value: string | null | undefined): string =>
  value ? ` ${name}="${escape(value)}"` : ''

/**
 * Описание карточки — Markdown, и html внутри него не исполняется: и `<script>`, и
 * `<img onerror>` показываются текстом. Очистка нужна не из-за многопользовательности —
 * пользователь один, — а потому что описание приезжает импортом из Trello.
 *
 * Одиночный перенос строки остаётся переносом (`breaks`): в Trello он значил именно это,
 * и привезённые описания иначе слипаются в абзац.
 */
const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escape(text),

    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens)
      const safe = safeHref(href)
      if (safe === null) return text

      // ссылка уводит со стола, а панель существует ровно ради обратного
      return `<a${attribute('href', safe)}${attribute('title', title)} target="_blank" rel="noreferrer noopener">${text}</a>`
    },

    image({ href, title, text }: Tokens.Image) {
      const safe = safeHref(href)
      if (safe === null) return escape(text)
      return `<img${attribute('src', safe)}${attribute('alt', text)}${attribute('title', title)}>`
    },
  },
})

export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false })
}
