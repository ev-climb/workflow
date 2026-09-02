'use client'

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  useAddChecklistItem,
  useCreateChecklist,
  useDeleteChecklist,
  useDeleteChecklistItem,
  useMoveChecklistItem,
  useRenameChecklist,
  useUpdateChecklistItem,
} from '@/lib/checklist-mutations'
import { itemDragId, planItemMove, type ItemDragData } from '@/lib/checklist-move'
import { checklistsQuery } from '@/lib/checklist-query'
import type { ChecklistItemView, ChecklistView } from '@/server/services/checklists'
import { Composer } from './Composer'
import { Failure } from './Failure'
import { TitleField } from './TitleField'

const quiet =
  'shrink-0 rounded px-1.5 py-0.5 text-xs text-neutral-500 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-600'

type Props = {
  boardId: string
  cardId: string
  /** Пока пункт летит, Escape отменяет перетаскивание, а не закрывает панель. */
  onDragging: (dragging: boolean) => void
}

/**
 * Чек-листы карточки. Пункты переставляются мышью и с клавиатуры, в том числе между
 * чек-листами одной карточки: контекст перетаскивания один на всю секцию.
 */
export function CardChecklists({ boardId, cardId, onDragging }: Props) {
  const { data, error, isPending } = useQuery(checklistsQuery(cardId))
  const create = useCreateChecklist(boardId, cardId)
  const move = useMoveChecklistItem(boardId, cardId)

  const sensors = useSensors(
    // порог обязателен: без него пункт не отметить мышью и не переименовать двойным кликом
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function end({ active, over }: DragEndEvent) {
    onDragging(false)

    const from = active.data.current as ItemDragData | undefined
    const to = over ? (over.data.current as ItemDragData | undefined) : undefined
    if (!data || !from || !to || from.type !== 'item') return

    const plan = planItemMove(data, from.item.id, to)
    if (plan) move.mutate({ itemId: from.item.id, ...plan })
  }

  return (
    // панель живёт в портале, но события всплывают по дереву React до самой карточки:
    // без остановки вместе с пунктом поехала бы и она
    <section onPointerDown={(event) => event.stopPropagation()}>
      <h3 className="mb-1.5 text-xs text-neutral-500">Чек-листы</h3>

      {error ? (
        <p className="text-sm text-neutral-500">Чек-листы не прочитались: {error.message}</p>
      ) : isPending ? null : (
        <DndContext
          // контекст вложен в стольный, и идентификатор задан явно: сам dnd-kit нумерует
          // их счётчиком модуля, а номер зависит от порядка отрисовки
          id="checklist-drag"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={() => onDragging(true)}
          onDragEnd={end}
          onDragCancel={() => onDragging(false)}
        >
          <ul className="space-y-4">
            {data.map((checklist) => (
              <li key={checklist.id}>
                <Checklist boardId={boardId} cardId={cardId} checklist={checklist} />
              </li>
            ))}
          </ul>
        </DndContext>
      )}

      <div className="mt-2">
        <Composer
          action="Чек-лист"
          label="Название нового чек-листа"
          onAdd={(title) => create.mutate(title)}
        />
      </div>

      <Failure error={create.error ?? move.error} className="pt-1" />
    </section>
  )
}

type ChecklistProps = { boardId: string; cardId: string; checklist: ChecklistView }

function Checklist({ boardId, cardId, checklist }: ChecklistProps) {
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const rename = useRenameChecklist(boardId, cardId, checklist.id)
  const remove = useDeleteChecklist(boardId, cardId, checklist.id)
  const add = useAddChecklistItem(boardId, cardId, checklist.id)

  // пустой чек-лист тоже должен быть целью: без этого в него нечем попасть пунктом
  const drop = useDroppable({
    id: itemDragId('checklist', checklist.id),
    data: { type: 'checklist', checklistId: checklist.id } satisfies ItemDragData,
  })

  const done = checklist.items.filter((item) => item.done).length
  const whole = checklist.items.length > 0 && done === checklist.items.length

  return (
    <section className="group/checklist">
      <div className="flex items-center gap-2">
        {renaming ? (
          <TitleField
            initial={checklist.title}
            label="Название чек-листа"
            onSubmit={(title) => rename.mutate(title)}
            onClose={() => setRenaming(false)}
            className="min-w-0 flex-1 rounded bg-neutral-800 px-1 text-sm leading-snug font-medium text-neutral-100"
          />
        ) : (
          <h4
            onDoubleClick={() => setRenaming(true)}
            title="Двойной клик — переименовать"
            className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-200"
          >
            {checklist.title}
          </h4>
        )}
        <span
          className={`shrink-0 text-xs tabular-nums ${whole ? 'text-emerald-400' : 'text-neutral-500'}`}
        >
          {done}/{checklist.items.length}
        </span>
        <button
          type="button"
          disabled={confirming}
          onClick={() => setConfirming(true)}
          aria-label={`Удалить чек-лист «${checklist.title}»`}
          className={`${quiet} opacity-0 group-hover/checklist:opacity-100 focus-visible:opacity-100`}
        >
          ×
        </button>
      </div>

      {confirming ? (
        <p className="mt-1 flex items-center gap-2 text-xs text-amber-300">
          {checklist.items.length ? `Пунктов внутри: ${checklist.items.length}.` : 'Пунктов нет.'}
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="rounded px-1.5 py-0.5 text-neutral-100 outline-none hover:bg-neutral-800 focus-visible:ring-1 focus-visible:ring-neutral-600"
          >
            Удалить
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded px-1.5 py-0.5 text-neutral-400 outline-none hover:bg-neutral-800 focus-visible:ring-1 focus-visible:ring-neutral-600"
          >
            Отмена
          </button>
        </p>
      ) : null}

      <ul
        ref={drop.setNodeRef}
        className={`mt-1 space-y-0.5 rounded ${checklist.items.length ? '' : 'min-h-8'} ${
          drop.isOver ? 'bg-neutral-800/40' : ''
        }`}
      >
        <SortableContext
          items={checklist.items.map((item) => itemDragId('item', item.id))}
          strategy={verticalListSortingStrategy}
        >
          {checklist.items.map((item) => (
            <Item
              key={item.id}
              boardId={boardId}
              cardId={cardId}
              checklistId={checklist.id}
              item={item}
            />
          ))}
        </SortableContext>
      </ul>

      <div className="mt-1">
        <Composer action="Пункт" label="Текст нового пункта" onAdd={(title) => add.mutate(title)} />
      </div>

      <Failure error={rename.error ?? remove.error ?? add.error} className="pt-1" />
    </section>
  )
}

type ItemProps = { boardId: string; cardId: string; checklistId: string; item: ChecklistItemView }

function Item({ boardId, cardId, checklistId, item }: ItemProps) {
  const [renaming, setRenaming] = useState(false)
  const [wish, setWish] = useState<boolean | null>(null)
  const update = useUpdateChecklistItem(boardId, cardId, item.id)
  const remove = useDeleteChecklistItem(boardId, cardId, item.id)

  // отметка держится нажатой, пока ответ в пути: иначе чекбокс отскакивает назад
  const done = wish ?? item.done
  useEffect(() => {
    if (wish !== null && item.done === wish) setWish(null)
  }, [item.done, wish])

  const data: ItemDragData = { type: 'item', checklistId, item }
  const drag = useSortable({ id: itemDragId('item', item.id), data, disabled: renaming })

  return (
    <li
      ref={drag.setNodeRef}
      style={{ transform: CSS.Translate.toString(drag.transform), transition: drag.transition }}
      className={
        // место пункта остаётся видимым: сам он едет за курсором
        drag.isDragging ? 'opacity-30' : ''
      }
    >
      <div className="group/item flex items-start gap-2 rounded px-1 py-0.5 hover:bg-neutral-900">
        <input
          type="checkbox"
          checked={done}
          aria-label={item.title}
          onChange={(event) => {
            setWish(event.target.checked)
            update.mutate({ done: event.target.checked }, { onError: () => setWish(null) })
          }}
          className="mt-0.5 size-3.5 shrink-0 accent-neutral-300"
        />

        {renaming ? (
          <TitleField
            initial={item.title}
            label="Текст пункта"
            onSubmit={(title) => update.mutate({ title })}
            onClose={() => setRenaming(false)}
            className="min-w-0 flex-1 rounded bg-neutral-800 px-1 text-sm leading-snug text-neutral-100"
          />
        ) : (
          <span
            ref={drag.setActivatorNodeRef}
            {...drag.attributes}
            {...drag.listeners}
            onDoubleClick={() => setRenaming(true)}
            title="Двойной клик — поправить"
            className={`min-w-0 flex-1 cursor-grab text-sm leading-snug outline-none focus-visible:ring-1 focus-visible:ring-neutral-600 ${
              done ? 'text-neutral-500 line-through' : 'text-neutral-200'
            }`}
          >
            {item.title}
          </span>
        )}

        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
          aria-label={`Удалить пункт «${item.title}»`}
          className={`${quiet} opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100`}
        >
          ×
        </button>
      </div>

      <Failure error={update.error ?? remove.error} className="pt-0.5 pl-6" />
    </li>
  )
}
