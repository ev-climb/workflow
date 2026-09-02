import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_STATE_COOKIE } from '@/lib/google-oauth'
import { InvalidInputError } from '@/server/services/errors'
import { connectGoogleAccount } from '@/server/services/google-accounts'
import { syncNow } from '@/server/services/sync-scheduler'

/**
 * Возврат из Google. Разбирает вход, зовёт сервис, уводит обратно в настройки —
 * итог показывается там, а не голым JSON: сюда приходит браузер, а не код.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const back = new URL('/settings', request.url)

  const settled = (query: [string, string]) => {
    back.searchParams.set(...query)
    const response = NextResponse.redirect(back, { status: 303 })
    // заявка отыграна: второй раз тот же `state` не подойдёт
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/api/auth/google' })
    return response
  }

  const denied = params.get('error')
  if (denied) return settled(['error', `Google не выдал доступ (${denied})`])

  const state = params.get('state')
  if (!state || state !== request.cookies.get(OAUTH_STATE_COOKIE)?.value) {
    return settled(['error', 'Возврат пришёл не из нашего запроса — подключение отменено'])
  }

  const code = params.get('code')
  if (!code) return settled(['error', 'Google вернулся без кода — подключение отменено'])

  try {
    const account = await connectGoogleAccount(code)
    // события подключённого аккаунта нужны сейчас, а не через фоновый тик
    syncNow()
    return settled(['connected', account.email])
  } catch (error) {
    if (error instanceof InvalidInputError) return settled(['error', error.message])
    throw error
  }
}
