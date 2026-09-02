import { describe, expect, it } from 'vitest'
import { parseCardInput } from './card-input.ts'
import { InvalidInputError } from './errors.ts'

// среда
const NOW = '2026-09-02'

const parse = (raw: string) => parseCardInput(raw, NOW)

describe('parseCardInput', () => {
  it('без разметки отдаёт всю строку заголовком', () => {
    expect(parse('  Починить   пуши ')).toEqual({ title: 'Починить пуши', due: null, labels: [] })
  })

  it('разбирает срок и метку из примера задания', () => {
    expect(parse('Починить пуши !пятница #баг')).toEqual({
      title: 'Починить пуши',
      due: { date: '2026-09-04', time: null },
      labels: ['баг'],
    })
  })

  it('берёт разметку в любом месте строки и склеивает заголовок', () => {
    expect(parse('#баг Починить !завтра пуши')).toEqual({
      title: 'Починить пуши',
      due: { date: '2026-09-03', time: null },
      labels: ['баг'],
    })
  })

  it('собирает все метки, а из сроков оставляет последний', () => {
    const parsed = parse('Разобрать #баг #срочно !сегодня !завтра')
    expect(parsed.labels).toEqual(['баг', 'срочно'])
    expect(parsed.due).toEqual({ date: '2026-09-03', time: null })
  })

  it('считает день недели от сегодня и всегда вперёд', () => {
    expect(parse('x !чт').due).toEqual({ date: '2026-09-03', time: null })
    expect(parse('x !вторник').due).toEqual({ date: '2026-09-08', time: null })
    expect(parse('x !среда').due).toEqual({ date: '2026-09-09', time: null })
  })

  it('понимает дату числами и дополняет год ближайшим', () => {
    expect(parse('x !2026-12-31').due).toEqual({ date: '2026-12-31', time: null })
    expect(parse('x !7.9').due).toEqual({ date: '2026-09-07', time: null })
    expect(parse('x !01.03').due).toEqual({ date: '2027-03-01', time: null })
    expect(parse('x !02.09').due).toEqual({ date: '2026-09-02', time: null })
    expect(parse('x !31.12.2030').due).toEqual({ date: '2030-12-31', time: null })
  })

  it('берёт время следующим словом, а без даты ставит его на сегодня', () => {
    expect(parse('Созвон !завтра 9:30').title).toBe('Созвон')
    expect(parse('Созвон !завтра 9:30').due).toEqual({ date: '2026-09-03', time: '09:30' })
    expect(parse('Созвон !18:00').due).toEqual({ date: NOW, time: '18:00' })
  })

  it('не путает время с заголовком, если срок не задан', () => {
    expect(parse('Созвон 18:00')).toEqual({ title: 'Созвон 18:00', due: null, labels: [] })
  })

  it('одинокие ! и # остаются в заголовке', () => {
    expect(parse('Ура ! # правда')).toEqual({ title: 'Ура ! # правда', due: null, labels: [] })
  })

  it('непонятный срок — ошибка входа', () => {
    expect(() => parse('Починить !когда-нибудь')).toThrow(InvalidInputError)
  })
})
