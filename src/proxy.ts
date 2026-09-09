import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'
import { hasValidSession } from '@/server/services/auth'

// у /api/mcp своя дверь — bearer-токен: сессии в браузере у клиента MCP нет
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/mcp']

// сюда браузер приходит переходом с домена Google, а не запросом из кода: на протухшей
// сессии нужна страница входа, после которой возврат доигрывается по `next`
const BROWSER_API_PATHS = ['/api/auth/google/callback']

/** В Next 16 middleware переименован в proxy и по умолчанию идёт в рантайме Node. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next()
  if (hasValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()

  // запрос из кода не отправляют на страницу входа: редирект вернул бы её HTML с кодом
  // 200, и клиент принял бы несохранённое за сохранённое
  if (pathname.startsWith('/api/') && !BROWSER_API_PATHS.includes(pathname)) {
    return NextResponse.json({ error: 'сессия негодная или истекла' }, { status: 401 })
  }

  const login = new URL('/login', request.url)
  if (pathname !== '/') login.searchParams.set('next', pathname + request.nextUrl.search)
  return NextResponse.redirect(login)
}

// фирменные картинки и иконки вкладки открыты: их запрашивает и страница входа, где
// сессии ещё нет, а редирект на /login вернул бы вместо картинки HTML
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|brand/|favicon\\.ico|icon\\.png|icon1\\.png|apple-icon\\.png|manifest\\.webmanifest).*)',
  ],
}
