// MCP поверх stdio для Claude Desktop:  pnpm mcp:stdio
// stdout занят протоколом — печатать в него нельзя ничего, диагностика идёт в stderr.
import '../scripts/load-env.ts'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createMcpServer } from '../src/server/mcp/server.ts'

serveStdio(() => createMcpServer(), {
  onerror: (error) => console.error(`MCP: ${error.message}`),
})
