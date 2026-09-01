'use client'

import { useQuery } from '@tanstack/react-query'
import { useCreateList } from '@/lib/board-mutations'
import { boardQuery } from '@/lib/board-query'
import type { BoardView } from '@/lib/board-view'
import { BoardColumn } from './BoardColumn'
import { Composer } from './Composer'
import { Failure } from './Failure'

const note = 'px-1 text-sm text-neutral-500'

type Props = { boardId: string; slot: string; initial?: BoardView }

export function Board({ boardId, slot, initial }: Props) {
  const { data, error, isPending } = useQuery({ ...boardQuery(boardId), initialData: initial })
  const create = useCreateList(boardId)

  if (error) return <p className={note}>Доска не прочиталась: {error.message}</p>
  if (isPending) return <p className={note}>Читаем доску…</p>

  return (
    <div className="flex h-full items-start gap-3">
      {data.lists.map((list) => (
        <BoardColumn key={list.id} boardId={boardId} slot={slot} list={list} />
      ))}
      <div className="w-72 shrink-0 rounded-lg bg-neutral-900/30 p-2">
        <Composer
          action="Список"
          label="Название нового списка"
          onAdd={(title) => create.mutate(title)}
        />
        <Failure error={create.error} />
      </div>
    </div>
  )
}
