'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { Failure } from '@/components/board/Failure'
import { addDays } from '@/lib/calendar-grid'
import { useEditEvent, useRemoveEvent, type EventEdit } from '@/lib/calendar-mutations'
import { eventQuery } from '@/lib/calendar-query'
import type { CalendarEventDetailsView, EventTimesInput } from '@/lib/calendar-view'
import { momentInMoscow, moscowParts } from '@/lib/dates'

type Props = { eventId: string; title: string; onClose: () => void }

/**
 * Событие изнутри. Время правится и здесь, и перетаскиванием по сетке — это два входа в
 * одну запись: оба собирают ту же пару времени и уходят тем же `PATCH`.
 *
 * Название известно заранее, из сетки: пока событие читается, у диалога есть имя.
 */
export function EventPanel({ eventId, title, onClose }: Props) {
  const { data, error, isPending } = useQuery(eventQuery(eventId))

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-sheet fixed top-0 right-0 z-50 flex h-full w-112 max-w-[calc(100vw-3rem)] flex-col overflow-y-auto rounded-l-2xl border-y-0 border-r-0 p-5 outline-none">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="px-1.5 text-base leading-snug font-medium text-fog">
                {data?.title ?? title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 truncate px-1.5 text-xs text-fog-dim">
                {data ? data.calendarTitle : 'Читаем событие…'}
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Закрыть" className="btn-quiet px-2 py-0.5 leading-none">
              ✕
            </Dialog.Close>
          </div>

          {error ? (
            <p role="status" className="mt-6 text-sm text-alarm">
              Событие не прочиталось: {error.message}
            </p>
          ) : isPending ? null : (
            <EventForm key={data.id} event={data} onClose={onClose} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type Draft = {
  title: string
  description: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}

/**
 * Поля панели. У события на весь день показывается его последний день, а не следующий за
 * ним: граница у Google исключающая, и человеку она не про что. Инвариант 3 — даты здесь
 * так и остаются строками, через часовой пояс не идут.
 */
function draftOf(event: CalendarEventDetailsView): Draft {
  const common = { title: event.title ?? '', description: event.description ?? '' }

  if (event.allDay) {
    return {
      ...common,
      startDate: event.startDate ?? '',
      startTime: '',
      endDate: event.endDate ? addDays(event.endDate, -1) : '',
      endTime: '',
    }
  }

  const from = event.startsAt ? moscowParts(event.startsAt) : null
  const to = event.endsAt ? moscowParts(event.endsAt) : null
  return {
    ...common,
    startDate: from?.date ?? '',
    startTime: from?.time ?? '',
    endDate: to?.date ?? '',
    endTime: to?.time ?? '',
  }
}

function timesOf(draft: Draft, allDay: boolean): EventTimesInput | null {
  if (allDay) {
    if (!draft.startDate || !draft.endDate) return null
    return { allDay: true, startDate: draft.startDate, endDate: addDays(draft.endDate, 1) }
  }

  if (!draft.startDate || !draft.startTime || !draft.endDate || !draft.endTime) return null
  return {
    allDay: false,
    startsAt: momentInMoscow(draft.startDate, draft.startTime).toISOString(),
    endsAt: momentInMoscow(draft.endDate, draft.endTime).toISOString(),
  }
}

function sameTimes(a: Draft, b: Draft): boolean {
  return (
    a.startDate === b.startDate &&
    a.startTime === b.startTime &&
    a.endDate === b.endDate &&
    a.endTime === b.endTime
  )
}

function EventForm({ event, onClose }: { event: CalendarEventDetailsView; onClose: () => void }) {
  const saved = draftOf(event)
  const [draft, setDraft] = useState(saved)
  const [confirming, setConfirming] = useState(false)
  const [gone, setGone] = useState(false)
  const edit = useEditEvent(event.id)
  const remove = useRemoveEvent()

  const times = timesOf(draft, event.allDay)
  const changes: EventEdit = {}
  if (draft.title !== saved.title) changes.title = draft.title
  if (draft.description !== saved.description) changes.description = draft.description
  if (times && !sameTimes(draft, saved)) changes.times = times
  const changed = Object.keys(changes).length > 0

  function field(key: keyof Draft) {
    return (value: string) => setDraft({ ...draft, [key]: value })
  }

  function submit(form: React.FormEvent) {
    form.preventDefault()
    if (!changed) {
      onClose()
      return
    }
    // событие, стёртое в Google из-под нас, правкой не воскрешаем: сказать об этом важнее,
    // чем закрыть панель как при удачной записи
    edit.mutate(changes, {
      onSuccess: (result) => (result.goneInGoogle ? setGone(true) : onClose()),
    })
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-1 flex-col gap-5">
      <section>
        <label
          htmlFor="event-title"
          className="mb-1.5 block text-[11px] tracking-[0.14em] text-fog-faint uppercase"
        >
          Название
        </label>
        <input
          id="event-title"
          value={draft.title}
          onChange={(input) => field('title')(input.target.value)}
          placeholder="Без названия"
          className="field w-full px-2 py-1.5 text-sm"
        />
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] tracking-[0.14em] text-fog-faint uppercase">
          {event.allDay ? 'Дни' : 'Время'}
        </h3>
        <div className="space-y-2">
          <Edge
            label="Начало"
            date={draft.startDate}
            time={event.allDay ? null : draft.startTime}
            onDate={field('startDate')}
            onTime={field('startTime')}
          />
          <Edge
            label="Конец"
            date={draft.endDate}
            time={event.allDay ? null : draft.endTime}
            onDate={field('endDate')}
            onTime={field('endTime')}
          />
        </div>
        {event.allDay ? (
          <p className="mt-1.5 text-xs text-fog-faint">
            последний день события, а не следующий за ним
          </p>
        ) : null}
      </section>

      {event.recurringEventId ? <Series htmlLink={event.htmlLink} /> : null}

      <section>
        <label
          htmlFor="event-description"
          className="mb-1.5 block text-[11px] tracking-[0.14em] text-fog-faint uppercase"
        >
          Описание
        </label>
        <textarea
          id="event-description"
          rows={6}
          value={draft.description}
          onChange={(input) => field('description')(input.target.value)}
          placeholder="Пусто"
          className="field w-full resize-y px-2 py-1.5 text-sm"
        />
        <p className="mt-1.5 text-xs text-fog-faint">
          обычный текст: разметка из Google при правке описания потеряется
        </p>
      </section>

      {gone ? (
        <p role="status" className="text-sm text-alarm">
          Событие успели удалить в Google — правка не записана.
        </p>
      ) : null}
      <Failure error={edit.error ?? remove.error} />

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={edit.isPending || remove.isPending}
          className="btn-primary px-3 py-1.5 text-sm"
        >
          {changed ? 'Сохранить' : 'Закрыть'}
        </button>
        <button type="button" onClick={onClose} className="btn-quiet px-3 py-1.5 text-sm">
          Отмена
        </button>
      </div>

      <div className="mt-auto border-t border-hair pt-4">
        {confirming ? (
          <>
            <p className="mb-2 text-sm text-fog-muted">
              Событие удалится и в Google. Вернуть его оттуда нельзя.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => remove.mutate(event.id, { onSuccess: onClose })}
                disabled={remove.isPending}
                className="btn-quiet px-3 py-1.5 text-sm text-alarm hover:bg-alarm-wash"
              >
                Удалить насовсем
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn-quiet px-3 py-1.5 text-sm"
              >
                Не надо
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn-quiet px-3 py-1.5 text-sm hover:text-alarm!"
          >
            Удалить событие
          </button>
        )}
      </div>
    </form>
  )
}

function Edge({
  label,
  date,
  time,
  onDate,
  onTime,
}: {
  label: string
  date: string
  /** `null` у события на весь день: времени у него нет и быть не должно. */
  time: string | null
  onDate: (value: string) => void
  onTime: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 shrink-0 text-sm text-fog-dim">{label}</span>
      <input
        type="date"
        aria-label={`${label}: дата`}
        value={date}
        onChange={(input) => onDate(input.target.value)}
        className="field px-2 py-1 text-sm"
      />
      {time === null ? null : (
        <input
          type="time"
          aria-label={`${label}: время`}
          value={time}
          onChange={(input) => onTime(input.target.value)}
          className="field px-2 py-1 text-sm"
        />
      )}
    </div>
  )
}

/**
 * Экземпляр повторяющегося события. Правка отсюда меняет только это вхождение: у экземпляра
 * свой идентификатор, и `PATCH` уходит по нему. Серию правят в Google — ADR-004, движка
 * правил повторения у нас нет.
 *
 * Ссылку даёт сам Google полем `htmlLink`; своей мы её не собираем — формат адресов их
 * веб-интерфейса не описан. У события, приехавшего без ссылки, остаётся одно объяснение.
 */
function Series({ htmlLink }: { htmlLink: string | null }) {
  return (
    <section className="rounded-xl border border-hair px-3 py-2.5">
      <p className="text-xs text-fog-muted">
        Повторяющееся событие. Правка здесь меняет только это вхождение.
      </p>
      {htmlLink ? (
        <a
          href={htmlLink}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-block text-xs text-accent underline underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-accent-line"
        >
          Открыть серию в Google Calendar
        </a>
      ) : null}
    </section>
  )
}
