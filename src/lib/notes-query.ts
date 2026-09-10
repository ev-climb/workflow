import type { DailyStats } from '@/server/services/daily'
import type { FolderView, NoteView } from '@/server/services/notes'
import { getJson } from './api-client'

/** Корень ключа: по нему разом гасятся все прочитанные виды шторки. */
export const notesKey = ['notes'] as const

export const foldersKey = ['note-folders'] as const

/** Список «Сегодня» и всё, что из него считается: закрытые дни и статистика. */
export const dailyKey = ['daily'] as const

export const dailyNoteQuery = {
  queryKey: [...dailyKey, 'note'] as const,
  queryFn: (): Promise<NoteView> => getJson<NoteView>('/api/daily'),
}

export function completeDaysQuery(from: string, to: string) {
  return {
    queryKey: [...dailyKey, 'days', from, to] as const,
    queryFn: (): Promise<string[]> => getJson<string[]>(`/api/daily/days?from=${from}&to=${to}`),
  }
}

export const dailyStatsQuery = {
  queryKey: [...dailyKey, 'stats'] as const,
  queryFn: (): Promise<DailyStats> => getJson<DailyStats>('/api/daily/stats'),
}

/**
 * Какие заметки показывает шторка. `undefined` — все живые, `null` — только те, что не
 * разложены по директориям. Архив приходит отдельным видом: в общем списке ему нечего
 * делать.
 */
export type NotesView = { folderId?: string | null; archived?: boolean }

const scope = (folderId: string | null | undefined) =>
  folderId === undefined ? 'all' : (folderId ?? 'none')

export function notesQuery(view: NotesView) {
  const params = new URLSearchParams()
  if (view.folderId !== undefined) params.set('folder', view.folderId ?? 'none')
  if (view.archived) params.set('archived', '1')
  const query = params.toString()

  return {
    queryKey: [...notesKey, scope(view.folderId), view.archived === true] as const,
    queryFn: (): Promise<NoteView[]> => getJson<NoteView[]>(`/api/notes${query ? `?${query}` : ''}`),
  }
}

export const foldersQuery = {
  queryKey: foldersKey,
  queryFn: (): Promise<FolderView[]> => getJson<FolderView[]>('/api/note-folders'),
}
