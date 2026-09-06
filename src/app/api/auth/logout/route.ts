import { seeOther } from '@/lib/http'
import { SESSION_COOKIE } from '@/lib/session'

/** Стирает куку сессии и возвращает на вход. Токен stateless — забыть его больше негде. */
export function POST() {
  const response = seeOther('/login')
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  })
  return response
}
