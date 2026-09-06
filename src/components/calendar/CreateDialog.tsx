'use client'

import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import type { Range } from '@/lib/calendar-drag'
import { useCreateEvent, useCreateTask } from '@/lib/calendar-mutations'
import {
  KindSwitch,
  ScheduleFields,
  scheduleCaption,
  scheduleTimes,
  useSchedule,
} from './Schedule'

type Props = { range: Range; onClose: () => void }

/**
 * Что заводим на выделенном отрезке — событие или задачу Google. Название переживает
 * переключение: набранное для события уходит в задачу, если человек передумал.
 *
 * Время здесь не правится — его задали выделением по сетке, а поправят перетаскиванием.
 */
export function CreateDialog({ range, onClose }: Props) {
  const [title, setTitle] = useState('')
  const schedule = useSchedule(true)

  const createEvent = useCreateEvent()
  const createTask = useCreateTask()

  const pending = createEvent.isPending || createTask.isPending

  function submit(event: React.FormEvent) {
    event.preventDefault()

    if (schedule.kind === 'task') {
      if (!schedule.taskListId) return
      createTask.mutate(
        { taskListId: schedule.taskListId, title, due: range.day },
        { onSuccess: onClose },
      )
      return
    }

    if (!schedule.calendarId) return
    createEvent.mutate(
      { calendarId: schedule.calendarId, title, times: scheduleTimes(schedule, range) },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 surface-sheet rounded-2xl p-4 outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-medium text-fog">
                {schedule.kind === 'event' ? 'Новое событие' : 'Новая задача'}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fog-dim">
                {scheduleCaption(schedule, range)}
              </Dialog.Description>
            </div>
            <KindSwitch value={schedule.kind} onChange={schedule.setKind} />
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

              <ScheduleFields schedule={schedule} />
            </div>

            <Failure error={createEvent.error ?? createTask.error} className="pt-3" />

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close type="button" className="btn-quiet px-3 py-1.5 text-sm">
                Отмена
              </Dialog.Close>
              <button
                type="submit"
                disabled={!schedule.target || pending}
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
