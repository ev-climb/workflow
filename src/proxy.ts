import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'
import { hasValidSession } from '@/server/services/auth'

const PUBLIC_PATHS = ['/login', '/api/auth/login']

/** В Next 16 middleware переименован в proxy и по умолчанию идёт в рантайме Node. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next()
  if (hasValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()

  const login = new URL('/login', request.url)
  if (pathname !== '/') login.searchParams.set('next', pathname + request.nextUrl.search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
