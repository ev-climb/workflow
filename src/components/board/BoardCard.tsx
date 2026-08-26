import { formatDue, isOverdue } from '@/lib/due'
import { labelColor } from '@/lib/label-colors'
import type { CardView } from '@/lib/board-view'

export function BoardCard({ card }: { card: CardView }) {
  const overdue = card.dueAt !== null && isOverdue(card.dueAt, card.dueDone)
  const checklistDone = card.checklistTotal > 0 && card.checklistDone === card.checklistTotal

  return (
    <article className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-2 hover:border-neutral-700">
      {card.labels.length ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <span
              key={label.id}
              title={label.name}
              className="h-1.5 w-9 rounded-full"
              style={{ backgroundColor: labelColor(label.color) }}
            />
          ))}
        </div>
      ) : null}

      <p className="text-sm leading-snug text-neutral-100">{card.title}</p>

      {card.hasDescription || card.checklistTotal > 0 || card.dueAt ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          {card.hasDescription ? <span title="Есть описание">≡</span> : null}
          {card.checklistTotal > 0 ? (
            <span
              title="Чек-лист"
              className={`tabular-nums ${checklistDone ? 'text-emerald-400' : ''}`}
            >
              ☑ {card.checklistDone}/{card.checklistTotal}
            </span>
          ) : null}
          {card.dueAt ? (
            <span
              title={card.dueDone ? 'Срок, отмечен выполненным' : 'Срок'}
              className={`rounded px-1 py-0.5 tabular-nums ${
                overdue
                  ? 'bg-red-950 text-red-300'
                  : card.dueDone
                    ? 'text-emerald-400 line-through'
                    : ''
              }`}
            >
              {formatDue(card.dueAt)}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
