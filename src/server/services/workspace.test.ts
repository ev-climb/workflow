import { describe, expect, it } from 'vitest'
import { createBoard } from './boards.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import {
  forgetBoardInSlots,
  getWorkspaceState,
  setBoardSlot,
  setCalendarMode,
  setSplitRatio,
} from './workspace.ts'

describe('состояние рабочего стола', () => {
  it('на пустой базе читается и не заводит слотов из воздуха', async () => {
    const state = await getWorkspaceState()

    expect(state.topBoardId).toBeNull()
    expect(state.bottomBoardId).toBeNull()
    expect(state.topBoardRatio).toBeCloseTo(0.5)
  })

  it('первое чтение ставит в слоты первые две доски по рангу', async () => {
    const first = await createBoard({ title: 'Первая' })
    const second = await createBoard({ title: 'Вторая' })
    await createBoard({ title: 'Третья' })

    const state = await getWorkspaceState()
    expect(state.topBoardId).toBe(first.id)
    expect(state.bottomBoardId).toBe(second.id)
  })

  it('единственная доска встаёт в оба слота', async () => {
    const only = await createBoard({ title: 'Одна' })

    const state = await getWorkspaceState()
    expect(state.topBoardId).toBe(only.id)
    expect(state.bottomBoardId).toBe(only.id)
  })

  it('повторное чтение не перезаписывает выбор', async () => {
    const first = await createBoard({ title: 'Первая' })
    const second = await createBoard({ title: 'Вторая' })

    await getWorkspaceState()
    await setBoardSlot('top', second.id)

    const again = await getWorkspaceState()
    expect(again.topBoardId).toBe(second.id)
    expect(again.bottomBoardId).toBe(second.id)
    expect(first.id).not.toBe(second.id)
  })

  it('одну доску можно поставить в оба слота', async () => {
    const first = await createBoard({ title: 'Первая' })
    await createBoard({ title: 'Вторая' })

    await setBoardSlot('bottom', first.id)
    const state = await getWorkspaceState()

    expect(state.topBoardId).toBe(first.id)
    expect(state.bottomBoardId).toBe(first.id)
  })

  it('слот можно освободить', async () => {
    await createBoard({ title: 'Доска' })
    await getWorkspaceState()

    expect((await setBoardSlot('bottom', null)).bottomBoardId).toBeNull()
  })

  it('несуществующая доска в слот не ставится', async () => {
    await expect(
      setBoardSlot('top', '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('доля высоты под верхнюю доску', () => {
  it('сохраняется', async () => {
    expect((await setSplitRatio(0.62)).topBoardRatio).toBeCloseTo(0.62, 5)
  })

  it('зажимается, чтобы слот не исчез совсем', async () => {
    expect((await setSplitRatio(0.01)).topBoardRatio).toBeCloseTo(0.15, 5)
    expect((await setSplitRatio(0.99)).topBoardRatio).toBeCloseTo(0.85, 5)
  })

  it('не число — ошибка входа', async () => {
    await expect(setSplitRatio(Number.NaN)).rejects.toThrow(InvalidInputError)
  })
})

describe('вид календаря', () => {
  it('по умолчанию недельный', async () => {
    expect((await getWorkspaceState()).calendarMode).toBe('week')
  })

  it('переключается и сохраняется', async () => {
    expect((await setCalendarMode('day')).calendarMode).toBe('day')
    expect((await getWorkspaceState()).calendarMode).toBe('day')
  })

  it('чужой вид не принимается', async () => {
    await expect(setCalendarMode('month')).rejects.toThrow(InvalidInputError)
  })
})

describe('доска исчезла из слотов', () => {
  it('гасит только свои слоты', async () => {
    const first = await createBoard({ title: 'Первая' })
    const second = await createBoard({ title: 'Вторая' })
    await getWorkspaceState()

    await forgetBoardInSlots(first.id)
    const state = await getWorkspaceState()

    expect(state.topBoardId).toBeNull()
    expect(state.bottomBoardId).toBe(second.id)
  })
})
