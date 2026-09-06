import { describe, expect, it } from 'vitest'
import { TasksAccessError, TasksApiError } from '@/server/google/tasks'
import { ReauthRequiredError } from '@/server/services/errors'
import { errorResponse, safeNext } from './http.ts'

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

describe('ответ на ошибку сервиса', () => {
  it('на умерший доступ к аккаунту Google отвечает 403, а не пятисоткой', async () => {
    const response = errorResponse(new ReauthRequiredError('аккаунт ya@ya.ru требует повторной авторизации'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'аккаунт ya@ya.ru требует повторной авторизации',
    })
  })

  it('на отказ Tasks отвечает 403 и текстом, который говорит, что чинить', async () => {
    const response = errorResponse(
      new TasksAccessError('Google отказал (задачи): нет доступа. Включи Tasks API в проекте Google Cloud', 403),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Google отказал (задачи): нет доступа. Включи Tasks API в проекте Google Cloud',
    })
  })

  it('токен без области tasks приходит с 401, но на форму входа не уводит', () => {
    expect(errorResponse(new TasksAccessError('Google отказал (задачи): переподключи аккаунт', 401)).status).toBe(403)
  })

  it('прочую поломку Tasks не прячет за ровным JSON', () => {
    const error = new TasksApiError('Google отказал (задачи): код 500', 500)

    expect(() => errorResponse(error)).toThrow(error)
  })
})
