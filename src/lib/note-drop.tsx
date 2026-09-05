'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { NoteView } from '@/server/services/notes'
import type { Range } from './calendar-drag'

/** Заметку таскают тем же контекстом, что карточки и списки, — целей у неё две. */
export type NoteDragData = { type: 'note'; note: NoteView }

export function isNoteDrag(data: unknown): data is NoteDragData {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'note'
}

/**
 * Куда заметку бросили. Колонка задаёт карточку, сетка — время: что именно завести на
 * сетке, событие или задачу, спрашивается уже в окне.
 */
export type NoteDropTarget =
  | { kind: 'board'; note: NoteView; boardId: string; listId: string; listTitle: string }
  | { kind: 'calendar'; note: NoteView; range: Range }

/**
 * Окно переноса открывает тот, кто поймал бросок: колонку ловит область перетаскивания,
 * сетку — сама сетка, а окно у них одно на двоих.
 */
const NoteDropContext = createContext<(target: NoteDropTarget) => void>(() => {})

export const useNoteDrop = () => useContext(NoteDropContext)

export function NoteDropProvider({
  onDrop,
  children,
}: {
  onDrop: (target: NoteDropTarget) => void
  children: ReactNode
}) {
  return <NoteDropContext.Provider value={onDrop}>{children}</NoteDropContext.Provider>
}
