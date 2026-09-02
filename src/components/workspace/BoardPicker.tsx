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
        className="flex items-center gap-2 rounded-lg px-2 py-1 text-[15.5px] font-semibold tracking-[-0.01em] text-fog transition-colors outline-none hover:bg-white/8 focus-visible:ring-1 focus-visible:ring-accent-line data-[state=open]:bg-white/8"
      >
        <Select.Value />
        <Select.Icon className="text-[9px] text-fog-dim">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden surface-menu"
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
      className="menu-item px-2 py-1 text-sm"
    >
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  )
}
