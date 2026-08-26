import type { ListView } from '@/lib/board-view'
import { BoardCard } from './BoardCard'

export function BoardColumn({ list }: { list: ListView }) {
  // лимит превышен — счётчик подсвечен, но ничего не запрещено: это сигнал, а не запрет
  const over = list.wipLimit !== null && list.cards.length > list.wipLimit

  return (
    <section className="flex max-h-full w-72 shrink-0 flex-col rounded-lg bg-neutral-900/60">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-200">
          {list.title}
        </h3>
        <span
          title={list.wipLimit === null ? 'Карточек в списке' : `Лимит списка — ${list.wipLimit}`}
          className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
            over ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-500'
          }`}
        >
          {list.wipLimit === null ? list.cards.length : `${list.cards.length}/${list.wipLimit}`}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {list.cards.map((card) => (
          <BoardCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  )
}
