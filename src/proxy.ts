import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'
import { hasValidSession } from '@/server/services/auth'

const PUBLIC_PATHS = ['/login', '/api/auth/login']

/** В Next 16 middleware переименован в proxy и по умолчанию идёт в рантайме Node. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next()
  if (hasValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()

  // запрос из кода не отправляют на страницу входа: редирект вернул бы её HTML с кодом
  // 200, и клиент принял бы несохранённое за сохранённое
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'сессия негодная или истекла' }, { status: 401 })
  }

  const login = new URL('/login', request.url)
  if (pathname !== '/') login.searchParams.set('next', pathname + request.nextUrl.search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
