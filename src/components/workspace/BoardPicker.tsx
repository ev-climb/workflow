'use client'

import { Select } from 'radix-ui'
import type { BoardSummary } from '@/server/services/boards'

// Radix не принимает пустую строку как значение пункта: пустой слот получает своё имя
const EMPTY = 'empty'

type Props = {
  boards: BoardSummary[]
  boardId: string | null
  label: string
  onChoose: (boardId: string | null) => void
}

export function BoardPicker({ boards, boardId, label, onChoose }: Props) {
  // доску могли заархивировать, пока стол был открыт: тогда слот показывается пустым
  const known = boardId !== null && boards.some((board) => board.id === boardId)

  return (
    <Select.Root
      value={known ? (boardId as string) : EMPTY}
      onValueChange={(value) => onChoose(value === EMPTY ? null : value)}
    >
      <Select.Trigger
        aria-label={label}
        className="flex items-center gap-2 rounded px-2 py-1 text-sm font-medium text-neutral-100 outline-none hover:bg-neutral-900 focus-visible:ring-1 focus-visible:ring-neutral-500 data-[state=open]:bg-neutral-900"
      >
        <Select.Value />
        <Select.Icon className="text-neutral-500">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden rounded border border-neutral-800 bg-neutral-900 shadow-lg"
        >
          <Select.Viewport className="p-1">
            <Item value={EMPTY}>Пусто</Item>
            {boards.map((board) => (
              <Item key={board.id} value={board.id}>
                {board.title}
              </Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function Item({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Select.Item
      value={value}
      className="cursor-pointer rounded px-2 py-1 text-sm text-neutral-200 outline-none select-none data-[highlighted]:bg-neutral-800 data-[state=checked]:text-white"
    >
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  )
}
