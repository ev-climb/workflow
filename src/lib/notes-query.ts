import type { FolderView, NoteView } from '@/server/services/notes'
import { getJson } from './api-client'

/** Корень ключа: по нему разом гасятся все прочитанные виды шторки. */
export const notesKey = ['notes'] as const

export const foldersKey = ['note-folders'] as const

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
