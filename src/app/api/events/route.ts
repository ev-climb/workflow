import { subscribeBoardChanged } from '@/server/services/board-events'

export const dynamic = 'force-dynamic'

// без трафика простаивающий поток рвут и прокси, и сам браузер
const HEARTBEAT_MS = 25_000

/**
 * Поток событий «доска изменилась». Вкладка по ним перечитывает запросы: полноценный
 * real-time не нужен, нужно чтобы вторая вкладка не показывала вчерашнее.
 */
export function GET(request: Request): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let unsubscribe = () => {}
      let heartbeat: ReturnType<typeof setInterval> | undefined

      const stop = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        request.signal.removeEventListener('abort', stop)
        try {
          controller.close()
        } catch {
          // вкладка успела оборвать соединение первой
        }
      }

      const send = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          stop()
        }
      }

      unsubscribe = subscribeBoardChanged((event) => {
        send(`event: board-changed\ndata: ${JSON.stringify(event)}\n\n`)
      })
      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)
      request.signal.addEventListener('abort', stop)

      send(': открыто\n\n')
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // nginx иначе копит поток в буфере и отдаёт его пачкой уже под конец
      'x-accel-buffering': 'no',
    },
  })
}
