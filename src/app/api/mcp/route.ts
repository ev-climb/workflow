import { createMcpHandler } from '@modelcontextprotocol/server'
import { NextResponse } from 'next/server'
import { createMcpServer } from '@/server/mcp/server'
import { hasValidMcpToken, mcpBearerToken } from '@/server/services/auth'

export const dynamic = 'force-dynamic'

// в dev Next пересоздаёт модуль на каждую правку, и без кеша копятся живые обработчики
const cache = globalThis as { __workflowMcpHandler?: ReturnType<typeof createMcpHandler> }

function mcpHandler() {
  cache.__workflowMcpHandler ??= createMcpHandler(() => createMcpServer(), {
    onerror: (error) => console.error(`MCP: ${error.message}`),
  })
  return cache.__workflowMcpHandler
}

/**
 * Транспорт Streamable HTTP. Токена в окружении нет — эндпоинта нет вовсе: 404, а не
 * открытая дверь. Проверку токена SDK на себя не берёт, она делается до передачи запроса.
 */
async function serve(request: Request): Promise<Response> {
  if (mcpBearerToken() === null) {
    return NextResponse.json(
      { error: 'MCP по HTTP выключен: MCP_BEARER_TOKEN не задан' },
      { status: 404 },
    )
  }

  if (!hasValidMcpToken(request.headers.get('authorization'))) {
    return NextResponse.json(
      { error: 'нужен заголовок Authorization: Bearer <MCP_BEARER_TOKEN>' },
      { status: 401, headers: { 'www-authenticate': 'Bearer' } },
    )
  }

  return mcpHandler().fetch(request)
}

// GET открывает поток ответов, DELETE закрывает сессию — оба нужны транспорту
export const POST = serve
export const GET = serve
export const DELETE = serve
