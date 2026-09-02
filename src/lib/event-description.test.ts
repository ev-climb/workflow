import { describe, expect, it } from 'vitest'
import { descriptionHtml, descriptionText } from './event-description'

describe('описание события из разметки в текст', () => {
  it('отсутствующее описание — пустое поле', () => {
    expect(descriptionText(null)).toBe('')
  })

  it('переносит строку на <br> и на конце абзаца', () => {
    expect(descriptionText('первая<br>вторая')).toBe('первая\nвторая')
    expect(descriptionText('<p>первая</p><p>вторая</p>')).toBe('первая\nвторая')
  })

  it('снимает теги и раскрывает сущности', () => {
    expect(descriptionText('<a href="https://meet.google.com/x">Meet</a>')).toBe('Meet')
    expect(descriptionText('Иванов &amp; сыновья &lt;тут&gt;')).toBe('Иванов & сыновья <тут>')
  })

  it('сводит пустые строки подряд к одной', () => {
    expect(descriptionText('первая<br><br><br><br>вторая')).toBe('первая\n\nвторая')
  })
})

describe('описание события из текста в разметку', () => {
  it('пустое описание уходит как отсутствующее, а не как пустая строка', () => {
    expect(descriptionHtml('')).toBeNull()
    expect(descriptionHtml('   \n  ')).toBeNull()
  })

  it('экранирует и переносит строки', () => {
    expect(descriptionHtml('a & b\n<тут>')).toBe('a &amp; b<br>&lt;тут&gt;')
  })

  it('текст переживает переход туда и обратно', () => {
    const text = 'Повестка:\n\n1. Сроки & бюджет\n2. Демо <новое>'
    expect(descriptionText(descriptionHtml(text))).toBe(text)
  })
})
