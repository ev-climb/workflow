'use client'

import { useState } from 'react'
import {
  clockOf,
  rangeAt,
  rangeDates,
  rangeSlot,
  rangeTimes,
  type Range,
} from '@/lib/calendar-drag'
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
 * Что заводим на отрезке — событие или задачу Google, куда, на весь ли день и с какого
 * по какое время. Об этом спрашивают и окно создания по сетке, и окно переноса заметки,
 * поэтому вопрос один на двоих.
 *
 * Время берётся из выделения, но правится прямо здесь: выделение по сетке кладёт границы
 * с точностью до четверти часа, а окно даёт вписать любые.
 *
 * `enabled` гасит чтение списков там, где выбора не показывают: заметке, брошенной
 * в колонку доски, ни календарь, ни список задач не нужны. `range` там же отсутствует —
 * времени у карточки нет.
 */
export function useSchedule(enabled: boolean, range: Range | null) {
  const [kind, setKind] = useState<Kind>('event')
  const [allDay, setAllDay] = useState(false)
  const [from, setFrom] = useState(() => clockOf(range?.start ?? 0))
  const [to, setTo] = useState(() => clockOf(range?.end ?? 0))
  const [chosenCalendar, setChosenCalendar] = useState<string | null>(null)
  const [chosenList, setChosenList] = useState<string | null>(null)

  const calendarId = useCalendarTarget(chosenCalendar, enabled && kind === 'event')
  const taskListId = useTaskListTarget(chosenList, enabled && kind === 'task')

  return {
    kind,
    setKind,
    allDay,
    setAllDay,
    from,
    setFrom,
    to,
    setTo,
    calendarId,
    taskListId,
    chooseCalendar: setChosenCalendar,
    chooseList: setChosenList,
    target: kind === 'event' ? calendarId : taskListId,
  }
}

/**
 * Время события: на весь день — даты без часового пояса, иначе границы из полей окна.
 */
export function scheduleTimes({ allDay, from, to }: Schedule, range: Range) {
  return allDay ? rangeDates(range) : rangeTimes(rangeAt(range.day, from, to))
}

/**
 * Часы задачи: с ними она встаёт блоком в сетку, без них уходит полосой наверх (ADR-015).
 * Отметка «весь день» у задачи означает «без времени» — держать два разных переключателя
 * на один и тот же вопрос незачем.
 */
export function scheduleSlot({ allDay, from, to }: Schedule, range: Range) {
  if (allDay) return { due: range.day, slot: null }
  const { day, ...slot } = rangeSlot(rangeAt(range.day, from, to))
  return { due: day, slot }
}

export function scheduleCaption({ kind, allDay }: Schedule, range: Range): string {
  const when =
    kind === 'task' ? (allDay ? 'срок' : 'задача') : allDay ? 'весь день' : 'событие'
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

/**
 * Время спрашивается одинаково у события и у задачи: задача со временем — такой же блок
 * в сетке, только с чекбоксом (ADR-015). Разница одна — как называется отметка, снимающая
 * время: у события это «весь день», у задачи «без времени, полосой сверху».
 */
export function ScheduleFields({ schedule }: { schedule: Schedule }) {
  const task = schedule.kind === 'task'

  return (
    <>
      {task ? (
        <TaskListChoice value={schedule.taskListId} onChange={schedule.chooseList} enabled />
      ) : (
        <CalendarChoice value={schedule.calendarId} onChange={schedule.chooseCalendar} enabled />
      )}
      {schedule.allDay ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fog-dim">Время</span>
          <input
            type="time"
            required
            aria-label="Начало"
            value={schedule.from}
            onChange={(event) => schedule.setFrom(event.target.value)}
            className="field px-2 py-1 text-sm"
          />
          <span className="text-sm text-fog-dim">—</span>
          <input
            type="time"
            required
            aria-label="Конец"
            value={schedule.to}
            onChange={(event) => schedule.setTo(event.target.value)}
            className="field px-2 py-1 text-sm"
          />
        </div>
      )}
      <label className="flex w-fit items-center gap-2 text-sm text-fog-muted">
        <input
          type="checkbox"
          checked={schedule.allDay}
          onChange={(event) => schedule.setAllDay(event.target.checked)}
          className="size-3.5 shrink-0 accent-accent"
        />
        {task ? 'Без времени, полосой сверху' : 'Весь день'}
      </label>
    </>
  )
}
