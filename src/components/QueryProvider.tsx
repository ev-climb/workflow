'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { useBoardEvents } from '@/lib/board-events'

/** Подписке нужен клиент запросов, поэтому она живёт отдельным узлом внутри провайдера. */
function BoardEvents() {
  useBoardEvents()
  return null
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            // ноль означал бы, что прочитанное на сервере протухло уже к гидратации: та же
            // доска пошла бы запросом второй раз. Сменившееся приносит поток событий, а
            // перечитывание по возврату во вкладку остаётся страховкой для того, чего в
            // потоке нет, — заметок и списков Google
            staleTime: 60_000,
            refetchOnWindowFocus: true,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      <BoardEvents />
      {children}
    </QueryClientProvider>
  )
}
