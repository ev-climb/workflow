import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('отрисовывает разметку', () => {
    const html = renderMarkdown('# Заголовок\n\n- раз\n- два\n\n**жирный** и `код`')

    expect(html).toContain('<h1>Заголовок</h1>')
    expect(html).toContain('<li>раз</li>')
    expect(html).toContain('<strong>жирный</strong>')
    expect(html).toContain('<code>код</code>')
  })

  it('оставляет одиночный перенос строки переносом', () => {
    expect(renderMarkdown('первая\nвторая')).toContain('<br>')
  })

  it('показывает блочный html текстом, а не исполняет его', () => {
    const html = renderMarkdown('<script>alert(1)</script>')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('показывает строчный html текстом', () => {
    const html = renderMarkdown('текст <img src=x onerror=alert(1)> дальше')

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('не пропускает обработчик события в атрибуте', () => {
    const html = renderMarkdown('<div onclick="alert(1)">блок</div>')

    expect(html).not.toContain('<div')
    expect(html).toContain('&lt;div onclick=&quot;alert(1)&quot;&gt;')
  })

  it('снимает ссылку с небезопасной схемой, оставляя текст', () => {
    const html = renderMarkdown('[клик](javascript:alert(1))')

    expect(html).not.toContain('href')
    expect(html).toContain('клик')
  })

  it('не обманывается управляющим символом внутри схемы', () => {
    expect(renderMarkdown('[клик](java\tscript:alert(1))')).not.toContain('href')
  })

  it('снимает картинку с небезопасной схемой, оставляя подпись', () => {
    const html = renderMarkdown('![кот](javascript:alert(1))')

    expect(html).not.toContain('<img')
    expect(html).toContain('кот')
  })

  it('оставляет обычную ссылку и уводит её в новую вкладку', () => {
    const html = renderMarkdown('[сайт](https://example.com/a-b?c=1)')

    expect(html).toContain('href="https://example.com/a-b?c=1"')
    expect(html).toContain('rel="noreferrer noopener"')
  })

  it('оставляет относительную ссылку и якорь', () => {
    expect(renderMarkdown('[там](/boards/1)')).toContain('href="/boards/1"')
    expect(renderMarkdown('[сюда](#метка)')).toContain('href="#метка"')
  })

  it('экранирует угловые скобки и амперсанд в обычном тексте', () => {
    expect(renderMarkdown('a < b & c > d')).toContain('a &lt; b &amp; c &gt; d')
  })

  it('экранирует содержимое блока кода', () => {
    expect(renderMarkdown('```\n<script>alert(1)</script>\n```')).not.toContain('<script>')
  })

  it('не ломается на кавычке в заголовке ссылки', () => {
    const html = renderMarkdown('[сайт](https://example.com "он \\" сказал")')

    expect(html).toContain('&quot;')
    expect(html).not.toContain('title="он " сказал"')
  })
})
