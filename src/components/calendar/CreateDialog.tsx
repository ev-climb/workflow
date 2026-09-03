'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog, Select } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { paintOf } from '@/lib/calendar-colors'
import { rangeDates, rangeTimes, timeLabel, type Range } from '@/lib/calendar-drag'
import { rangeLabel } from '@/lib/calendar-grid'
import { useCreateEvent, useCreateTask } from '@/lib/calendar-mutations'
import { calendarsQuery, taskListsQuery } from '@/lib/calendar-query'

type Props = { range: Range; onClose: () => void }

type Kind = 'event' | 'task'

const KIND_LABEL: Record<Kind, string> = { event: 'Событие', task: 'Задача' }

/**
 * Что заводим на выделенном отрезке — событие или задачу Google. Название переживает
 * переключение: набранное для события уходит в задачу, если человек передумал.
 *
 * Время здесь не правится — его задали выделением по сетке, а поправят перетаскиванием.
 * Отметка «весь день» — единственный способ завести такое событие: выделением по сетке
 * его не получить, минут у него нет.
 *
 * У задачи от выделения остаётся один день: времени у срока задачи не бывает вовсе,
 * и минуты отрезка ей ни к чему.
 *
 * Календари предлагаются только показанные: событие, заведённое в спрятанном, пропало бы
 * с глаз сразу после создания.
 */
export function CreateDialog({ range, onClose }: Props) {
  const [kind, setKind] = useState<Kind>('event')
  const [title, setTitle] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [chosenCalendar, setChosenCalendar] = useState<string | null>(null)
  const [chosenList, setChosenList] = useState<string | null>(null)

  const calendars = useQuery({ ...calendarsQuery, enabled: kind === 'event' })
  const lists = useQuery({ ...taskListsQuery, enabled: kind === 'task' })
  const createEvent = useCreateEvent()
  const createTask = useCreateTask()

  // только показанные и только те, куда пускают писать: в подписной вроде «Праздников
  // России» Google не даст завести событие
  const calendarOptions = (calendars.data ?? []).filter(
    (calendar) => calendar.visible && calendar.writable,
  )
  const calendarId = chosenCalendar ?? calendarOptions[0]?.id ?? null
  const listOptions = lists.data ?? []
  const taskListId = chosenList ?? listOptions[0]?.id ?? null

  const target = kind === 'event' ? calendarId : taskListId
  const pending = createEvent.isPending || createTask.isPending

  function submit(event: React.FormEvent) {
    event.preventDefault()

    if (kind === 'task') {
      if (!taskListId) return
      createTask.mutate({ taskListId, title, due: range.day }, { onSuccess: onClose })
      return
    }

    if (!calendarId) return
    const times = allDay ? rangeDates(range) : rangeTimes(range)
    createEvent.mutate({ calendarId, title, times }, { onSuccess: onClose })
  }

  function when(): string {
    if (kind === 'task') return 'срок'
    return allDay ? 'весь день' : timeLabel(range)
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 surface-sheet rounded-2xl p-4 outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-medium text-fog">
                {kind === 'event' ? 'Новое событие' : 'Новая задача'}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fog-dim">
                {rangeLabel('day', [range.day])}, {when()}
              </Dialog.Description>
            </div>
            <div className="segment shrink-0">
              {(Object.keys(KIND_LABEL) as Kind[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                  className="segment-item px-2.5 py-1 text-xs font-medium"
                >
                  {KIND_LABEL[value]}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={submit}>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="new-title" className="mb-1 block text-xs text-fog-dim">
                  Название
                </label>
                <input
                  id="new-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoFocus
                  placeholder="Без названия"
                  className="field w-full px-2 py-1.5 text-sm"
                />
              </div>

              {kind === 'event' ? (
                <div>
                  <p className="mb-1 text-xs text-fog-dim">Календарь</p>
                  <Select.Root value={calendarId ?? undefined} onValueChange={setChosenCalendar}>
                    <Select.Trigger
                      aria-label="Календарь"
                      disabled={!calendarOptions.length}
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
                          {calendarOptions.map((calendar) => (
                            <Select.Item
                              key={calendar.id}
                              value={calendar.id}
                              className="menu-item flex items-center gap-2 px-2 py-1 text-sm"
                            >
                              <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: paintOf(calendar.color, calendar.accountColor),
                                }}
                              />
                              <Select.ItemText>{calendar.title}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              ) : (
                <div>
                  <p className="mb-1 text-xs text-fog-dim">Список задач</p>
                  <Select.Root value={taskListId ?? undefined} onValueChange={setChosenList}>
                    <Select.Trigger
                      aria-label="Список задач"
                      disabled={!listOptions.length}
                      className="field flex w-full items-center justify-between gap-2 px-2 py-1.5 text-sm disabled:text-fog-dim"
                    >
                      <Select.Value
                        placeholder={lists.isPending ? 'Читаем списки…' : 'Списков задач нет'}
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
                          {listOptions.map((list) => (
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
                              <span className="ml-auto truncate text-xs text-fog-dim">
                                {list.accountEmail}
                              </span>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              )}

              {kind === 'event' ? (
                <label className="flex items-center gap-2 text-sm text-fog-muted">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(event) => setAllDay(event.target.checked)}
                    className="size-3.5 shrink-0 accent-accent"
                  />
                  Весь день
                </label>
              ) : null}
            </div>

            {kind === 'event' && calendars.data && !calendarOptions.length ? (
              <p className="mt-3 text-xs text-fog-dim">
                Писать некуда: свои календари спрятаны или открыты только на чтение.
              </p>
            ) : null}

            <Failure
              error={calendars.error ?? lists.error ?? createEvent.error ?? createTask.error}
              className="pt-3"
            />

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close type="button" className="btn-quiet px-3 py-1.5 text-sm">
                Отмена
              </Dialog.Close>
              <button
                type="submit"
                disabled={!target || pending}
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
