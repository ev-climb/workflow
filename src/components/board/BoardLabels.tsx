'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog, Select } from 'radix-ui'
import { useState } from 'react'
import { boardQuery } from '@/lib/board-query'
import { LABEL_COLORS, labelColor, labelColorName } from '@/lib/label-colors'
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from '@/lib/label-mutations'
import type { LabelSummary } from '@/server/services/boards'
import { Failure } from './Failure'

const field =
  'field min-w-0 flex-1 px-2 py-1 text-sm'

const quiet =
  'btn-quiet shrink-0 px-2 py-1 text-xs'

/** Набор меток доски: заводятся, переименовываются, меняют цвет и удаляются здесь. */
export function BoardLabels({ boardId }: { boardId: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="btn-quiet px-2.5 py-1 text-xs">
        Метки
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-4rem)] w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col surface-sheet rounded-2xl p-4 outline-none">
          <Dialog.Title className="shrink-0 text-sm font-medium text-fog">
            Метки доски
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 shrink-0 text-xs text-fog-dim">
            Набор общий для всей доски: на карточках метки только переключаются.
          </Dialog.Description>
          <LabelSet boardId={boardId} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function LabelSet({ boardId }: { boardId: string }) {
  const { data, error, isPending } = useQuery(boardQuery(boardId))

  if (error) return <p className="mt-4 text-sm text-fog-dim">Доска не прочиталась.</p>
  if (isPending) return <p className="mt-4 text-sm text-fog-dim">Читаем метки…</p>

  const used = new Set(data.labels.map((label) => label.color))

  return (
    <>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {data.labels.length ? (
          <ul className="space-y-1.5">
            {data.labels.map((label) => (
              <LabelRow key={label.id} boardId={boardId} label={label} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fog-dim">Меток на доске пока нет.</p>
        )}
      </div>
      <NewLabel
        boardId={boardId}
        suggested={LABEL_COLORS.find((color) => !used.has(color.id))?.id ?? LABEL_COLORS[0].id}
      />
    </>
  )
}

function LabelRow({ boardId, label }: { boardId: string; label: LabelSummary }) {
  const [confirming, setConfirming] = useState(false)
  const update = useUpdateLabel(boardId, label.id)
  const remove = useDeleteLabel(boardId, label.id)

  const title = label.name || 'без названия'

  return (
    <li>
      <div className="flex items-center gap-2">
        {/*
          Поле неуправляемое, а `key` сбрасывает его на чужое переименование: правка,
          приехавшая по SSE, иначе осталась бы не видна, пока поле открыто.
        */}
        <input
          key={label.name}
          defaultValue={label.name}
          maxLength={128}
          placeholder="без названия"
          aria-label={`Название метки «${title}»`}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.currentTarget.value = label.name
              event.currentTarget.blur()
            }
          }}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim()
            if (name !== label.name) update.mutate({ name })
          }}
          className={field}
        />
        <ColorChoice
          value={label.color}
          label={`Цвет метки «${title}»`}
          onChange={(color) => update.mutate({ color })}
        />
        <button
          type="button"
          disabled={confirming}
          onClick={() => setConfirming(true)}
          aria-label={`Удалить метку «${title}»`}
          className={quiet}
        >
          ×
        </button>
      </div>
      {confirming ? (
        <p className="mt-1 flex items-center gap-2 pl-1 text-xs text-caution">
          Снимется со всех карточек доски.
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="btn-quiet px-1.5 py-0.5 text-fog!"
          >
            Удалить
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="btn-quiet px-1.5 py-0.5"
          >
            Отмена
          </button>
        </p>
      ) : null}
      <Failure error={update.error ?? remove.error} className="pt-1 pl-1" />
    </li>
  )
}

function NewLabel({ boardId, suggested }: { boardId: string; suggested: string }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(suggested)
  const create = useCreateLabel(boardId)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate({ name: name.trim(), color }, { onSuccess: () => setName('') })
      }}
      className="mt-3 shrink-0 border-t border-hair pt-3"
    >
      <div className="flex items-center gap-2">
        <input
          value={name}
          maxLength={128}
          placeholder="Новая метка"
          aria-label="Название новой метки"
          onChange={(event) => setName(event.target.value)}
          className={field}
        />
        <ColorChoice value={color} label="Цвет новой метки" onChange={setColor} />
        <button
          type="submit"
          disabled={create.isPending}
          className="btn-primary shrink-0 px-3 py-1 text-sm"
        >
          Добавить
        </button>
      </div>
      <Failure error={create.error} className="pt-1 pl-1" />
    </form>
  )
}

type ColorProps = { value: string; label: string; onChange: (color: string) => void }

/**
 * Цвет из Trello (`green_dark`) в наборе не значится и потому не подсвечен как выбранный,
 * но виден в кнопке: сбросить его молча на «зелёный» было бы правкой без просьбы.
 */
function ColorChoice({ value, label, onChange }: ColorProps) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        aria-label={label}
        className="field flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs"
      >
        <Swatch color={value} />
        <span className="w-20 truncate text-left">{labelColorName(value)}</span>
        <Select.Icon className="text-fog-dim">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-64 overflow-hidden surface-menu"
        >
          <Select.Viewport className="p-1">
            {LABEL_COLORS.map((color) => (
              <Select.Item
                key={color.id}
                value={color.id}
                className="menu-item flex items-center gap-2 px-2 py-1 text-sm"
              >
                <Swatch color={color.id} />
                <Select.ItemText>{color.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="h-1 w-8 shrink-0 rounded-full"
      style={{ backgroundColor: labelColor(color) }}
    />
  )
}
