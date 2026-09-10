'use client'

import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { KindSwitch, type Kind } from './Schedule'
import {
  CalendarChoice,
  TaskListChoice,
  useCalendarTarget,
  useTaskListTarget,
} from './TargetChoice'

/**
 * Смена типа записи из панели правки. В Google событие и задача — разные продукты с
 * разными ключами, поэтому переносится содержимое, а не запись: на новой стороне
 * заводится своя, старая стирается (ADR-015). Спрашиваем дважды — переключателем и
 * кнопкой, — потому что отменить это нечем.
 *
 * Куда переносим, выбирается тут же: у события это календарь, у задачи — список задач.
 */
export function KindSection({
  kind,
  onConvert,
  pending,
  error,
}: {
  kind: Kind
  onConvert: (targetId: string) => void
  pending: boolean
  error: Error | null
}) {
  const [converting, setConverting] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)

  const other: Kind = kind === 'event' ? 'task' : 'event'
  const calendarId = useCalendarTarget(chosen, converting && other === 'event')
  const taskListId = useTaskListTarget(chosen, converting && other === 'task')
  const target = other === 'event' ? calendarId : taskListId

  return (
    <section>
      <h3 className="mb-1.5 text-[11px] tracking-[0.14em] text-fog-faint uppercase">Тип</h3>
      <KindSwitch
        value={converting ? other : kind}
        onChange={(picked) => {
          setConverting(picked !== kind)
          setChosen(null)
        }}
      />

      {converting ? (
        <div className="mt-2.5 space-y-2.5 rounded-xl border border-hair px-3 py-2.5">
          <p className="text-xs text-fog-muted">
            {other === 'task'
              ? 'Событие удалится из календаря, а содержимое заведётся задачей.' +
                ' Ссылки на событие перестанут работать.'
              : 'Задача удалится из Tasks, а содержимое заведётся событием.' +
                ' Отметка «выполнена» при этом пропадёт: у события её нет.'}
          </p>

          {other === 'event' ? (
            <CalendarChoice value={calendarId} onChange={setChosen} />
          ) : (
            <TaskListChoice value={taskListId} onChange={setChosen} />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!target || pending}
              onClick={() => target && onConvert(target)}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              {other === 'task' ? 'Сделать задачей' : 'Сделать событием'}
            </button>
            <button
              type="button"
              onClick={() => setConverting(false)}
              className="btn-quiet px-3 py-1.5 text-sm"
            >
              Не надо
            </button>
          </div>

          <Failure error={error} />
        </div>
      ) : null}
    </section>
  )
}
