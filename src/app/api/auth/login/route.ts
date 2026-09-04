import { type NextRequest } from 'next/server'
import { seeOther } from '@/lib/http'
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session'
import { signIn } from '@/server/services/auth'
import { UnauthorizedError } from '@/server/services/errors'

/** Разбирает форму, зовёт сервис, ставит куку. Логики здесь нет — инвариант 2. */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const password = String(form.get('password') ?? '')
  const next = safeNext(String(form.get('next') ?? '/'))

  try {
    const { token, expiresAt } = await signIn(password)
    const response = seeOther(next)
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE,
      expires: expiresAt,
    })
    return response
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const back = new URLSearchParams({ error: '1' })
      if (next !== '/') back.set('next', next)
      return seeOther(`/login?${back}`)
    }
    throw error
  }
}

/** Только свои пути: иначе форма превратилась бы в открытый редирект. */
function safeNext(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}
