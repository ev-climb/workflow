import { McpServer } from '@modelcontextprotocol/server'
import { registerTools } from './tools.ts'

/**
 * Одна фабрика на оба входа. SDK зовёт её на каждое соединение stdio и на каждый запрос
 * по HTTP, поэтому в ней не должно быть ничего дорогого: набор инструментов собирается
 * заново, состояние живёт в базе.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'workflow', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  registerTools(server)
  return server
}
