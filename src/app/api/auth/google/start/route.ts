import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE } from '@/lib/google-oauth'
import { beginGoogleConnect } from '@/server/services/google-accounts'

/** Уводит на согласие Google, запомнив `state` в куке. Логики здесь нет — инвариант 2. */
export function GET(request: NextRequest) {
  const { url, state } = beginGoogleConnect(request.nextUrl.searchParams.get('email'))

  const response = NextResponse.redirect(url, { status: 303 })
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    // возврат приходит переходом с домена Google: при `strict` куку бы не прислали
    sameSite: 'lax',
    path: '/api/auth/google',
    secure: process.env.NODE_ENV === 'production',
    maxAge: OAUTH_STATE_MAX_AGE,
  })
  return response
}
