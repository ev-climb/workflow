'use client'

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { NoteKind } from '@/lib/notes'
import type { CardPosition } from '@/server/services/cards'
import type { NoteView } from '@/server/services/notes'
import { sendJson } from './api-client'
import { archiveKey } from './archive-query'
import { boardKey } from './board-query'
import { cardsKey } from './card-query'
import { foldersKey, notesKey } from './notes-query'

/**
 * После любой правки шторка перечитывается целиком, корнем ключа: заметок в ней десятки,
 * а не тысячи, и точечное обновление стоило бы дороже запроса. Директории — вместе с
 * ними: у каждой на виду счётчик заметок.
 */
function refreshNotes(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: notesKey }),
    client.invalidateQueries({ queryKey: foldersKey }),
  ])
}

function useNoteChange<T = void, R = unknown>(request: (input: T) => Promise<R>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: request,
    onSuccess: () => void refreshNotes(client),
  })
}

export type NoteDraft = {
  folderId?: string | null
  kind?: NoteKind
  title?: string | null
  body?: string | null
}

export const useCreateNote = () =>
  useNoteChange((draft: NoteDraft) => sendJson<NoteView>('POST', '/api/notes', draft))

export const useUpdateNote = (noteId: string) =>
  useNoteChange((changes: { title?: string | null; body?: string | null }) =>
    sendJson('PATCH', `/api/notes/${noteId}`, changes),
  )

export const useMoveNote = (noteId: string) =>
  useNoteChange((folderId: string | null) =>
    sendJson('PATCH', `/api/notes/${noteId}`, { folderId }),
  )

export const useArchiveNote = (noteId: string) =>
  useNoteChange((archived: boolean) =>
    sendJson('PATCH', `/api/notes/${noteId}`, { archived }),
  )

export const useDeleteNote = (noteId: string) =>
  useNoteChange(() => sendJson('DELETE', `/api/notes/${noteId}`))

export const useAddNoteItem = (noteId: string) =>
  useNoteChange((title: string) => sendJson('POST', `/api/notes/${noteId}/items`, { title }))

export const useUpdateNoteItem = (itemId: string) =>
  useNoteChange((changes: { title?: string; done?: boolean }) =>
    sendJson('PATCH', `/api/note-items/${itemId}`, changes),
  )

export const useDeleteNoteItem = (itemId: string) =>
  useNoteChange(() => sendJson('DELETE', `/api/note-items/${itemId}`))

export const useCreateFolder = () =>
  useNoteChange((title: string) => sendJson('POST', '/api/note-folders', { title }))

export const useRenameFolder = (folderId: string) =>
  useNoteChange((title: string) => sendJson('PATCH', `/api/note-folders/${folderId}`, { title }))

export const useDeleteFolder = (folderId: string) =>
  useNoteChange(() => sendJson('DELETE', `/api/note-folders/${folderId}`))

export type NoteToCard = {
  noteId: string
  boardId: string
  listId: string
  title: string
  description?: string | null
  archive?: boolean
}

/**
 * Заметка в карточку. Гасится и шторка, и доска-приёмник: карточка появляется в колонке
 * сразу, а заметка исчезает из списка, если её отправили в архив.
 */
export function useNoteToCard() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ noteId, boardId: _boardId, ...body }: NoteToCard) =>
      sendJson<CardPosition>('POST', `/api/notes/${noteId}/card`, body),
    onSuccess: (_created, { boardId }) => {
      void refreshNotes(client)
      void client.invalidateQueries({ queryKey: boardKey(boardId) })
      void client.invalidateQueries({ queryKey: archiveKey(boardId) })
      void client.invalidateQueries({ queryKey: cardsKey })
    },
  })
}
