'use client'

import { useQuery } from '@tanstack/react-query'
import { Select } from 'radix-ui'
import { Failure } from '@/components/board/Failure'
import { paintOf } from '@/lib/calendar-colors'
import { calendarsQuery, taskListsQuery } from '@/lib/calendar-query'

const TRIGGER =
  'field flex w-full items-center justify-between gap-2 px-2 py-1.5 text-sm disabled:text-fog-dim'

const CONTENT = 'surface-menu z-50 max-h-64 overflow-hidden'

/**
 * Куда заводить событие или задачу. Вынесено из диалога создания: то же самое спрашивает
 * окно переноса заметки, и два списка с одинаковыми оговорками про права и видимость
 * лучше держать в одном месте.
 */
export function CalendarChoice({
  value,
  onChange,
  enabled = true,
}: {
  value: string | null
  onChange: (id: string) => void
  enabled?: boolean
}) {
  const calendars = useQuery({ ...calendarsQuery, enabled })

  // только показанные и только те, куда пускают писать: в подписной вроде «Праздников
  // России» Google не даст завести событие
  const options = (calendars.data ?? []).filter(
    (calendar) => calendar.visible && calendar.writable,
  )

  return (
    <div>
      <p className="mb-1 text-xs text-fog-dim">Календарь</p>
      <Select.Root value={value ?? undefined} onValueChange={onChange}>
        <Select.Trigger aria-label="Календарь" disabled={!options.length} className={TRIGGER}>
          <Select.Value
            placeholder={calendars.isPending ? 'Читаем календари…' : 'Календарей нет'}
          />
          <Select.Icon className="text-fog-dim">▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content position="popper" sideOffset={4} className={CONTENT}>
            <Select.Viewport className="p-1">
              {options.map((calendar) => (
                <Select.Item
                  key={calendar.id}
                  value={calendar.id}
                  className="menu-item flex items-center gap-2 px-2 py-1 text-sm"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: paintOf(calendar.color, calendar.accountColor) }}
                  />
                  <Select.ItemText>{calendar.title}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {calendars.data && !options.length ? (
        <p className="mt-2 text-xs text-fog-dim">
          Писать некуда: свои календари спрятаны или открыты только на чтение.
        </p>
      ) : null}
      <Failure error={calendars.error} className="pt-2" />
    </div>
  )
}

export function TaskListChoice({
  value,
  onChange,
  enabled = true,
}: {
  value: string | null
  onChange: (id: string) => void
  enabled?: boolean
}) {
  const lists = useQuery({ ...taskListsQuery, enabled })
  const options = lists.data ?? []

  return (
    <div>
      <p className="mb-1 text-xs text-fog-dim">Список задач</p>
      <Select.Root value={value ?? undefined} onValueChange={onChange}>
        <Select.Trigger aria-label="Список задач" disabled={!options.length} className={TRIGGER}>
          <Select.Value placeholder={lists.isPending ? 'Читаем списки…' : 'Списков задач нет'} />
          <Select.Icon className="text-fog-dim">▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content position="popper" sideOffset={4} className={CONTENT}>
            <Select.Viewport className="p-1">
              {options.map((list) => (
                <Select.Item
                  key={list.id}
                  value={list.id}
                  className="menu-item flex items-center gap-2 px-2 py-1 text-sm"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: list.color }}
                  />
                  <Select.ItemText>{list.title}</Select.ItemText>
                  <span className="ml-auto truncate text-xs text-fog-dim">{list.accountEmail}</span>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <Failure error={lists.error} className="pt-2" />
    </div>
  )
}

/** Первый пригодный вариант, пока человек не выбрал свой. */
export function useCalendarTarget(chosen: string | null, enabled: boolean): string | null {
  const calendars = useQuery({ ...calendarsQuery, enabled })
  const options = (calendars.data ?? []).filter(
    (calendar) => calendar.visible && calendar.writable,
  )
  return chosen ?? options[0]?.id ?? null
}

export function useTaskListTarget(chosen: string | null, enabled: boolean): string | null {
  const lists = useQuery({ ...taskListsQuery, enabled })
  return chosen ?? lists.data?.[0]?.id ?? null
}
