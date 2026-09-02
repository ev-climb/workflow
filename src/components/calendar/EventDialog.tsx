'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog, Select } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { rangeTimes, timeLabel, type Range } from '@/lib/calendar-drag'
import { rangeLabel } from '@/lib/calendar-grid'
import { useCreateEvent } from '@/lib/calendar-mutations'
import { calendarsQuery } from '@/lib/calendar-query'

type Props = { range: Range; onClose: () => void }

/**
 * Новое событие: название и календарь, в который оно ляжет. Время здесь не правится — его
 * задали выделением по сетке, а поправят перетаскиванием.
 *
 * Календари предлагаются только показанные: событие, заведённое в спрятанном, пропало бы
 * с глаз сразу после создания.
 */
export function EventDialog({ range, onClose }: Props) {
  const calendars = useQuery(calendarsQuery)
  const create = useCreateEvent()
  const [title, setTitle] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)

  const options = (calendars.data ?? []).filter((calendar) => calendar.visible)
  const calendarId = chosen ?? options[0]?.id ?? null

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!calendarId) return
    create.mutate({ calendarId, title, times: rangeTimes(range) }, { onSuccess: onClose })
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 surface-sheet rounded-2xl p-4 outline-none">
          <Dialog.Title className="text-sm font-medium text-fog">Новое событие</Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-fog-dim">
            {rangeLabel('day', [range.day])}, {timeLabel(range)}
          </Dialog.Description>

          <form onSubmit={submit}>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="event-title" className="mb-1 block text-xs text-fog-dim">
                  Название
                </label>
                <input
                  id="event-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoFocus
                  placeholder="Без названия"
                  className="field w-full px-2 py-1.5 text-sm"
                />
              </div>

              <div>
                <p className="mb-1 text-xs text-fog-dim">Календарь</p>
                <Select.Root value={calendarId ?? undefined} onValueChange={setChosen}>
                  <Select.Trigger
                    aria-label="Календарь"
                    disabled={!options.length}
                    className="field flex w-full items-center justify-between gap-2 px-2 py-1.5 text-sm disabled:text-fog-dim"
                  >
                    <Select.Value
                      placeholder={calendars.isPending ? 'Читаем календари…' : 'Календарей нет'}
                    />
                    <Select.Icon className="text-fog-dim">▾</Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      position="popper"
                      sideOffset={4}
                      className="z-50 max-h-64 overflow-hidden surface-menu"
                    >
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
                              style={{ backgroundColor: calendar.color ?? undefined }}
                            />
                            <Select.ItemText>{calendar.title}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
            </div>

            {calendars.data && !options.length ? (
              <p className="mt-3 text-xs text-fog-dim">
                Ни один календарь не показан — включи его в настройках.
              </p>
            ) : null}

            <Failure error={calendars.error ?? create.error} className="pt-3" />

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close
                type="button"
                className="btn-quiet px-3 py-1.5 text-sm"
              >
                Отмена
              </Dialog.Close>
              <button
                type="submit"
                disabled={!calendarId || create.isPending}
                className="btn-primary px-3 py-1.5 text-sm"
              >
                Создать
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
