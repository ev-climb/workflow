import { describe, expect, it } from 'vitest'
import { safeNext } from './http.ts'

describe('путь возврата после входа', () => {
  it('пропускает свой путь вместе с запросом и якорем', () => {
    expect(safeNext('/boards/42?view=week#now')).toBe('/boards/42?view=week#now')
  })

  it('не уводит на чужой домен через обратный слэш', () => {
    expect(safeNext('/\\evil.com')).toBe('/')
    expect(safeNext('/\\\\evil.com')).toBe('/')
  })

  it('не уводит на чужой домен протокольно-относительным адресом', () => {
    expect(safeNext('//evil.com')).toBe('/')
  })

  it('не принимает абсолютный адрес и чужую схему', () => {
    expect(safeNext('https://evil.com/')).toBe('/')
    expect(safeNext('javascript:alert(1)')).toBe('/')
  })

  it('не принимает путь без ведущего слэша', () => {
    expect(safeNext('')).toBe('/')
    expect(safeNext('boards')).toBe('/')
  })

  it('не пускает в заголовок перевод строки', () => {
    expect(safeNext('/boards\r\nLocation: https://evil.com')).not.toContain('\r')
    expect(safeNext('/boards\r\nLocation: https://evil.com')).not.toContain('\n')
  })
})
