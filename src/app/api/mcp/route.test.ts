import { afterAll, describe, expect, it } from 'vitest'
import { POST } from './route.ts'

const before = process.env.MCP_BEARER_TOKEN
process.env.MCP_BEARER_TOKEN = 's3cret'

afterAll(() => {
  if (before === undefined) delete process.env.MCP_BEARER_TOKEN
  else process.env.MCP_BEARER_TOKEN = before
})

function handshake(headers: Record<string, string>): Promise<Response> {
  return POST(
    new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      }),
    }),
  )
}

type Handshake = { serverInfo: { name: string }; capabilities: Record<string, unknown> }

/** Транспорт сам выбирает, отдать тело JSON или кадр SSE, — тесту годятся обе формы. */
async function result(response: Response): Promise<Handshake> {
  const text = await response.text()
  const json = text.startsWith('event:') ? (text.match(/^data: (.*)$/m)?.[1] ?? '') : text
  return JSON.parse(json).result as Handshake
}

describe('MCP по HTTP', () => {
  it('без заголовка — 401 и приглашение назвать токен', async () => {
    const response = await handshake({})

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('с чужим токеном — 401', async () => {
    expect((await handshake({ authorization: 'Bearer wrong' })).status).toBe(401)
  })

  it('со своим токеном — рукопожатие с набором инструментов', async () => {
    const response = await handshake({ authorization: 'Bearer s3cret' })
    expect(response.status).toBe(200)

    const body = await result(response)
    expect(body.serverInfo.name).toBe('workflow')
    expect(body.capabilities.tools).toBeDefined()
  })
})
