'use client'

import { useState } from 'react'
import { rangeDates, rangeTimes, timeLabel, type Range } from '@/lib/calendar-drag'
import { rangeLabel } from '@/lib/calendar-grid'
import {
  CalendarChoice,
  TaskListChoice,
  useCalendarTarget,
  useTaskListTarget,
} from './TargetChoice'

export type Kind = 'event' | 'task'

const KIND_LABEL: Record<Kind, string> = { event: 'Событие', task: 'Задача' }

export type Schedule = ReturnType<typeof useSchedule>

/**
 * Что заводим на отрезке — событие или задачу Google, куда и на весь ли день. Об этом
 * спрашивают и окно создания по сетке, и окно переноса заметки, поэтому вопрос один
 * на двоих.
 *
 * Отметка «весь день» — единственный способ завести такое событие: выделением по сетке
 * его не получить, минут у него нет.
 *
 * `enabled` гасит чтение списков там, где выбора не показывают: заметке, брошенной
 * в колонку доски, ни календарь, ни список задач не нужны.
 */
export function useSchedule(enabled: boolean) {
  const [kind, setKind] = useState<Kind>('event')
  const [allDay, setAllDay] = useState(false)
  const [chosenCalendar, setChosenCalendar] = useState<string | null>(null)
  const [chosenList, setChosenList] = useState<string | null>(null)

  const calendarId = useCalendarTarget(chosenCalendar, enabled && kind === 'event')
  const taskListId = useTaskListTarget(chosenList, enabled && kind === 'task')

  return {
    kind,
    setKind,
    allDay,
    setAllDay,
    calendarId,
    taskListId,
    chooseCalendar: setChosenCalendar,
    chooseList: setChosenList,
    target: kind === 'event' ? calendarId : taskListId,
  }
}

/**
 * Время события по отрезку: на весь день — даты без часового пояса, иначе границы
 * выделения. Задаче отрезок отдаёт только день: времени у срока не бывает вовсе.
 */
export function scheduleTimes({ allDay }: Schedule, range: Range) {
  return allDay ? rangeDates(range) : rangeTimes(range)
}

export function scheduleCaption({ kind, allDay }: Schedule, range: Range): string {
  const when = kind === 'task' ? 'срок' : allDay ? 'весь день' : timeLabel(range)
  return `${rangeLabel('day', [range.day])}, ${when}`
}

export function KindSwitch({
  value,
  onChange,
}: {
  value: Kind
  onChange: (kind: Kind) => void
}) {
  return (
    <div className="segment shrink-0">
      {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          onClick={() => onChange(kind)}
          className="segment-item px-2.5 py-1 text-xs font-medium"
        >
          {KIND_LABEL[kind]}
        </button>
      ))}
    </div>
  )
}

export function ScheduleFields({ schedule }: { schedule: Schedule }) {
  if (schedule.kind === 'task') {
    return <TaskListChoice value={schedule.taskListId} onChange={schedule.chooseList} enabled />
  }

  return (
    <>
      <CalendarChoice value={schedule.calendarId} onChange={schedule.chooseCalendar} enabled />
      <label className="flex items-center gap-2 text-sm text-fog-muted">
        <input
          type="checkbox"
          checked={schedule.allDay}
          onChange={(event) => schedule.setAllDay(event.target.checked)}
          className="size-3.5 shrink-0 accent-accent"
        />
        Весь день
      </label>
    </>
  )
}
