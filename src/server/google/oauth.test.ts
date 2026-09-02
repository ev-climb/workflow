import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { authUrl } from './oauth.ts'

const real = {
  id: process.env.GOOGLE_CLIENT_ID,
  redirect: process.env.GOOGLE_REDIRECT_URI,
}

// адрес согласия собирается из настоящих переменных: тесту нужны предсказуемые,
// а соседние файлы читают тот же process.env
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'client.apps.googleusercontent.com'
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
})

afterAll(() => {
  process.env.GOOGLE_CLIENT_ID = real.id
  process.env.GOOGLE_REDIRECT_URI = real.redirect
})

describe('адрес согласия Google', () => {
  it('без почты подсказки нет: подключается любой аккаунт', () => {
    const url = new URL(authUrl('state-1'))

    expect(url.searchParams.get('login_hint')).toBeNull()
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('с почтой Google предлагает именно её', () => {
    const url = new URL(authUrl('state-2', 'me@gmail.com'))

    expect(url.searchParams.get('login_hint')).toBe('me@gmail.com')
  })
})
