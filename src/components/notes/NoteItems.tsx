'use client'

import { Checkbox } from 'radix-ui'
import { useDeleteNoteItem, useUpdateNoteItem } from '@/lib/notes-mutations'
import type { NoteItemView } from '@/server/services/notes'

/**
 * Пункт списка дел. Отмечается прямо в шторке, не раскрывая заметку: отметить дело —
 * самое частое, что с ним делают. Отметка ловит щелчок всей строкой, а не одним
 * квадратиком. Удаление показывается только в правке: в списке крестик у каждой строки
 * был бы шумом.
 */
function Item({ item, editing }: { item: NoteItemView; editing: boolean }) {
  const update = useUpdateNoteItem(item.id)
  const remove = useDeleteNoteItem(item.id)

  return (
    <li className="group/item flex items-start">
      <Checkbox.Root
        checked={item.done}
        disabled={update.isPending}
        onCheckedChange={(next) => update.mutate({ done: next === true })}
        // щелчок по пункту не должен раскрывать заметку в правку: отметить дело — не то же
        // самое, что сесть её редактировать
        onClick={(event) => event.stopPropagation()}
        className="-mx-2 flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-2 py-1.5 text-left outline-none transition-colors hover:bg-white/5 focus-visible:bg-white/5"
      >
        {/* Radix ставит `data-state` только на корень, а рисуется квадратик здесь */}
        <span className="tick mt-px shrink-0" data-state={item.done ? 'checked' : 'unchecked'}>
          <svg
            viewBox="0 0 24 24"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-[opacity,transform] duration-300 ${
              item.done ? '' : 'scale-50 opacity-0'
            }`}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span
          className={`min-w-0 flex-1 text-[13px] leading-[1.45] transition-colors ${
            item.done ? 'text-fog-dim line-through' : 'text-fog-muted'
          }`}
        >
          {item.title}
        </span>
      </Checkbox.Root>

      {editing ? (
        <button
          type="button"
          aria-label={`Удалить пункт «${item.title}»`}
          disabled={remove.isPending}
          onClick={(event) => {
            event.stopPropagation()
            remove.mutate()
          }}
          className="btn-quiet mt-1.5 px-1 text-[11px] leading-none opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"
        >
          ✕
        </button>
      ) : null}
    </li>
  )
}

export function NoteItems({ items, editing }: { items: NoteItemView[]; editing: boolean }) {
  if (!items.length) return null

  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <Item key={item.id} item={item} editing={editing} />
      ))}
    </ul>
  )
}
