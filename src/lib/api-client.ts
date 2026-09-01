/**
 * Ответ маршрута или ошибка с его текстом. Отдельно ловится оборванная сеть: без этого
 * в интерфейс попадало бы «Failed to fetch», а прокси на негодной сессии отвечает
 * обычным JSON с полем error и его видно как есть.
 */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new Error('сервер не ответил')
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `сервер ответил ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function sendJson<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  return getJson<T>(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}
