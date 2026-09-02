import { describe, expect, it } from 'vitest'
import { publishBoardChanged } from '@/server/services/board-events'
import { viewersOnline } from '@/server/services/viewers'
import { GET } from './route.ts'

/** Один кадр потока: первый — приветственный комментарий, дальше события. */
async function frames(response: Response, count: number): Promise<string[]> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const out: string[] = []

  for (let i = 0; i < count; i++) {
    const { value } = await reader.read()
    out.push(decoder.decode(value))
  }
  return out
}

describe('поток событий', () => {
  it('отдаётся как text/event-stream и не кэшируется', () => {
    const response = GET(new Request('http://localhost/api/events'))

    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('cache-control')).toContain('no-cache')
  })

  it('пересылает событие доски именованным кадром', async () => {
    const response = GET(new Request('http://localhost/api/events'))
    const stream = frames(response, 2)

    publishBoardChanged('доска-7')
    const [hello, event] = await stream

    expect(hello).toBe(': открыто\n\n')
    expect(event).toBe('event: board-changed\ndata: {"boardId":"доска-7"}\n\n')
  })

  it('обрыв соединения закрывает поток и снимает подписку', async () => {
    const abort = new AbortController()
    const response = GET(new Request('http://localhost/api/events', { signal: abort.signal }))
    const reader = response.body!.getReader()

    await reader.read()
    abort.abort()
    expect(await reader.read()).toEqual({ done: true, value: undefined })

    // подписки не осталось: событие после обрыва никого не находит и не бросается
    expect(() => publishBoardChanged('доска-7')).not.toThrow()
  })

  it('пока поток жив, вкладка считается смотрящей', async () => {
    const before = viewersOnline()
    const abort = new AbortController()
    const response = GET(new Request('http://localhost/api/events', { signal: abort.signal }))

    expect(viewersOnline()).toBe(before + 1)

    const reader = response.body!.getReader()
    await reader.read()
    abort.abort()

    expect(viewersOnline()).toBe(before)
  })
})
