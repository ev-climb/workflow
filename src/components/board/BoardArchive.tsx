'use client'

import { useQuery } from '@tanstack/react-query'
import { archiveQuery } from '@/lib/archive-query'
import type { ArchivedCardView, ArchivedListView, ArchiveView } from '@/lib/archive-view'
import { useRestoreCard, useRestoreList } from '@/lib/board-mutations'
import { formatMoment } from '@/lib/dates'
import { Failure } from './Failure'

const note = 'text-sm text-fog-dim'

export function BoardArchive({ boardId, initial }: { boardId: string; initial: ArchiveView }) {
  const { data, error } = useQuery({ ...archiveQuery(boardId), initialData: initial })

  if (error) return <p className={note}>Архив не прочитался: {error.message}</p>
  if (!data.lists.length && !data.cards.length) return <p className={note}>Архив пуст.</p>

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
      {data.lists.length ? (
        <Section title="Списки">
          {data.lists.map((list) => (
            <ListRow key={list.id} boardId={boardId} list={list} />
          ))}
        </Section>
      ) : null}
      {data.cards.length ? (
        <Section title="Карточки">
          {data.cards.map((card) => (
            <CardRow key={card.id} boardId={boardId} card={card} />
          ))}
        </Section>
      ) : null}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[11px] tracking-[0.14em] text-fog-faint uppercase">{title}</h2>
      <ul className="space-y-1">{children}</ul>
    </section>
  )
}

function ListRow({ boardId, list }: { boardId: string; list: ArchivedListView }) {
  const restore = useRestoreList(boardId, list.id)

  return <Row title={list.title} archivedAt={list.archivedAt} restore={restore} what="список" />
}

function CardRow({ boardId, card }: { boardId: string; card: ArchivedCardView }) {
  const restore = useRestoreCard(boardId, card.id)

  return (
    <Row
      title={card.title}
      from={card.listTitle}
      archivedAt={card.archivedAt}
      restore={restore}
      what="карточку"
    />
  )
}

type RowProps = {
  title: string
  from?: string
  archivedAt: string
  what: string
  restore: { mutate: () => void; isPending: boolean; error: Error | null }
}

/** Восстановление возвращает элемент в конец: прежнее место могли занять. */
function Row({ title, from, archivedAt, what, restore }: RowProps) {
  return (
    <li className="surface-card px-3 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 text-sm text-fog">{title}</span>
        {from ? <span className="shrink-0 text-xs text-fog-dim">из «{from}»</span> : null}
        <span className="shrink-0 font-mono text-[11px] text-fog-faint tabular-nums">
          {formatMoment(archivedAt)}
        </span>
        <button
          type="button"
          disabled={restore.isPending}
          onClick={() => restore.mutate()}
          aria-label={`Вернуть ${what} «${title}»`}
          className="btn-quiet shrink-0 px-2 py-0.5 text-xs"
        >
          Вернуть
        </button>
      </div>
      <Failure error={restore.error} className="pt-1" />
    </li>
  )
}
