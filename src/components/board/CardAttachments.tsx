'use client'

import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useAddAttachment, useDeleteAttachment } from '@/lib/attachment-mutations'
import { attachmentsQuery } from '@/lib/attachment-query'
import type { AttachmentView } from '@/server/services/attachments'
import { Failure } from './Failure'

type Props = { cardId: string }

const UNITS = ['Б', 'КБ', 'МБ']

function fileSize(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`
}

/**
 * Вложения карточки. Файл кладётся по одному: маршрут принимает одно поле `file`, а
 * половина принятой пачки хуже, чем два выбора подряд.
 */
export function CardAttachments({ cardId }: Props) {
  const { data, error, isPending } = useQuery(attachmentsQuery(cardId))
  const add = useAddAttachment(cardId)
  const picker = useRef<HTMLInputElement>(null)

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] tracking-[0.14em] text-fog-faint uppercase">Вложения</h3>
        <button
          type="button"
          disabled={add.isPending}
          onClick={() => picker.current?.click()}
          className="btn-quiet px-1.5 py-0.5 text-xs"
        >
          {add.isPending ? 'Загружаем…' : 'Добавить'}
        </button>
      </div>

      <input
        ref={picker}
        type="file"
        hidden
        aria-label="Файл вложения"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // поле сбрасывается сразу: иначе тот же файл вторым выбором не даст события
          event.target.value = ''
          if (file) add.mutate(file)
        }}
      />

      {error ? (
        <p className="text-sm text-fog-dim">Вложения не прочитались: {error.message}</p>
      ) : isPending ? null : data.length ? (
        <ul className="space-y-0.5">
          {data.map((attachment) => (
            <li key={attachment.id}>
              <Attachment cardId={cardId} attachment={attachment} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fog-faint">пусто</p>
      )}

      <Failure error={add.error} className="pt-1" />
    </section>
  )
}

type AttachmentProps = { cardId: string; attachment: AttachmentView }

function Attachment({ cardId, attachment }: AttachmentProps) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteAttachment(cardId, attachment.id)

  return (
    <div className="group/attachment">
      <div className="flex items-center gap-2">
        <a
          // маршрут отдаёт файл под сессией и с content-disposition: attachment —
          // на нашем домене вложение не откроется, только скачается
          href={`/api/attachments/${attachment.id}`}
          className="min-w-0 flex-1 truncate rounded-lg px-1.5 py-0.5 text-sm text-fog outline-none transition-colors hover:bg-white/6 focus-visible:ring-1 focus-visible:ring-accent-line"
        >
          {attachment.name}
        </a>
        <span className="shrink-0 text-xs tabular-nums text-fog-dim">
          {fileSize(attachment.sizeBytes)}
        </span>
        <button
          type="button"
          disabled={confirming}
          onClick={() => setConfirming(true)}
          aria-label={`Удалить вложение «${attachment.name}»`}
          className="btn-quiet shrink-0 px-1.5 py-0.5 text-xs opacity-0 group-hover/attachment:opacity-100 focus-visible:opacity-100"
        >
          ×
        </button>
      </div>

      {confirming ? (
        <p className="mt-1 flex items-center gap-2 text-xs text-caution">
          Удалить насовсем, архива у вложений нет.
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="rounded px-1.5 py-0.5 text-fog outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent-line"
          >
            Удалить
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded px-1.5 py-0.5 text-fog-muted outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent-line"
          >
            Отмена
          </button>
        </p>
      ) : null}

      <Failure error={remove.error} className="pt-1" />
    </div>
  )
}
