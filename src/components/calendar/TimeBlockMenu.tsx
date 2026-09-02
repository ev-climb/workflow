'use client'

import { useQuery } from '@tanstack/react-query'
import { DropdownMenu } from 'radix-ui'
import { useMirrorTimeBlock, useRemoveTimeBlock } from '@/lib/calendar-mutations'
import { calendarsQuery } from '@/lib/calendar-query'

const ITEM = 'menu-item flex items-center px-2 py-1 text-sm'

/** Значение переключателя, когда зеркала нет: у «нигде» своего календаря не бывает. */
const NOWHERE = 'nowhere'

type Props = { blockId: string; cardTitle: string; calendarId: string | null }

/**
 * Меню тайм-блока: где показывать его в Google и как снять с сетки. Календари те же, что
 * при создании события, — только показанные: зеркало в спрятанном календаре пропало бы
 * с глаз сразу после включения.
 */
export function TimeBlockMenu({ blockId, cardTitle, calendarId }: Props) {
  const calendars = useQuery(calendarsQuery)
  const mirror = useMirrorTimeBlock(blockId)
  const remove = useRemoveTimeBlock()

  const options = (calendars.data ?? []).filter((calendar) => calendar.visible)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Меню тайм-блока: ${cardTitle}`}
        title="Меню тайм-блока"
        className="btn-quiet absolute top-0 right-0 px-1 text-[11px] leading-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-accent-line data-[state=open]:opacity-100"
      >
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="surface-menu z-50 min-w-56 p-1">
          <DropdownMenu.Label className="px-2 py-1 text-[11px] tracking-[0.14em] text-fog-faint uppercase">
            Показывать в Google
          </DropdownMenu.Label>

          <DropdownMenu.RadioGroup
            value={calendarId ?? NOWHERE}
            onValueChange={(value) => mirror.mutate(value === NOWHERE ? null : value)}
          >
            <DropdownMenu.RadioItem value={NOWHERE} className={ITEM} disabled={mirror.isPending}>
              <Mark />
              Нигде
            </DropdownMenu.RadioItem>
            {options.map((calendar) => (
              <DropdownMenu.RadioItem
                key={calendar.id}
                value={calendar.id}
                className={ITEM}
                disabled={mirror.isPending}
              >
                <Mark />
                <span className="truncate">{calendar.title}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>

          {calendars.isError ? (
            <p role="status" className="px-2 py-1 text-xs text-alarm">
              Календари не прочитались
            </p>
          ) : null}
          {mirror.error ? (
            <p role="status" className="px-2 py-1 text-xs text-alarm">
              Зеркало не записалось: {mirror.error.message}
            </p>
          ) : null}

          <DropdownMenu.Separator className="my-1 h-px bg-hair" />
          <DropdownMenu.Item
            className={ITEM}
            disabled={remove.isPending}
            onSelect={() => remove.mutate(blockId)}
          >
            Убрать блок
          </DropdownMenu.Item>
          {remove.error ? (
            <p role="status" className="px-2 py-1 text-xs text-alarm">
              Блок не убрался: {remove.error.message}
            </p>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** Место под галочку одной ширины у всех строк: без него названия разъезжаются. */
function Mark() {
  return (
    <span className="inline-block w-4 shrink-0 text-accent">
      <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
    </span>
  )
}
