'use client'

import { useQuery } from '@tanstack/react-query'
import { boardQuery } from '@/lib/board-query'
import type { BoardView } from '@/lib/board-view'
import { BoardColumn } from './BoardColumn'

const note = 'px-1 text-sm text-neutral-500'

export function Board({ boardId, initial }: { boardId: string; initial?: BoardView }) {
  const { data, error, isPending } = useQuery({ ...boardQuery(boardId), initialData: initial })

  if (error) return <p className={note}>Доска не прочиталась: {error.message}</p>
  if (isPending) return <p className={note}>Читаем доску…</p>
  if (!data.lists.length) return <p className={note}>В доске «{data.title}» ещё нет списков.</p>

  return (
    <div className="flex h-full items-start gap-3">
      {data.lists.map((list) => (
        <BoardColumn key={list.id} list={list} />
      ))}
    </div>
  )
}
