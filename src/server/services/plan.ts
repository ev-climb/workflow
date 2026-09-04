import { addDays, moscowToday } from '../../lib/calendar-grid.ts'
import type { BoardCard } from './boards.ts'
import { getBoard } from './boards.ts'
import type { CardDue } from './cards.ts'
import { listDueCards } from './cards.ts'
import { InvalidInputError } from './errors.ts'
import type { CalendarEvent } from './google-events.ts'
import { listEvents } from './google-events.ts'
import type { TimeBlock } from './time-blocks.ts'
import { listTimeBlocks } from './time-blocks.ts'
import { getWorkspaceState } from './workspace.ts'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export type PlanList = {
  id: string
  title: string
  cards: BoardCard[]
}

export type PlanBoard = {
  id: string
  title: string
  inWork: PlanList[]
  /** Названия колонок доски — только когда рабочая не опозналась: иначе пустота необъяснима. */
  lists?: string[]
}

export type DayPlan = {
  date: string
  events: CalendarEvent[]
  timeBlocks: TimeBlock[]
  /** Сроки на сегодня и завтра: завтрашние нужны, чтобы вечером было видно, что горит. */
  due: CardDue[]
  boards: PlanBoard[]
}

/**
 * Признака «рабочая колонка» в схеме нет, а заводить его ради одного инструмента дороже,
 * чем ошибиться: опознаём по названию и по выставленному лимиту. Лимит на списке и
 * означает ограничение незавершённой работы, так что он тут точнее любого названия — но
 * на живых досках он не заполнен, и название остаётся единственным признаком.
 */
const IN_WORK = ['сейчас', 'в работе', 'в процессе', 'делаю', 'doing', 'in progress', 'wip']

function isInWork(list: { title: string; wipLimit: number | null }): boolean {
  if (list.wipLimit !== null) return true

  const title = list.title.trim().toLowerCase()
  return IN_WORK.some(
    (name) => title === name || title.startsWith(`${name} `) || title.startsWith(`${name}(`),
  )
}

async function planBoard(boardId: string): Promise<PlanBoard> {
  const board = await getBoard(boardId)
  const inWork = board.lists.filter(isInWork)

  return {
    id: board.id,
    title: board.title,
    inWork: inWork.map((list) => ({ id: list.id, title: list.title, cards: list.cards })),
    ...(inWork.length ? {} : { lists: board.lists.map((list) => list.title) }),
  }
}

/**
 * Всё, что нужно для ответа на «чем заняться»: расписание дня, отведённое под карточки
 * время, ближайшие сроки и работа, взятая на обеих досках стола. Собрано в один вызов
 * намеренно — по частям это шесть обращений, и половина контекста уходит на их склейку.
 *
 * Доски берутся из состояния стола, а не все подряд: доска, которую я не смотрю, к
 * сегодняшнему дню отношения не имеет. Одна доска в обоих слотах считается один раз.
 */
export async function planDay(date?: string): Promise<DayPlan> {
  const day = date ?? moscowToday()
  if (!DATE.test(day)) throw new InvalidInputError('день — дата вида 2026-09-02')

  const workspace = await getWorkspaceState()
  const slots = [workspace.topBoardId, workspace.bottomBoardId].filter(
    (id): id is string => id !== null,
  )

  const [events, timeBlocks, due, boards] = await Promise.all([
    listEvents(day, day),
    listTimeBlocks(day, day),
    listDueCards(day, addDays(day, 1)),
    Promise.all([...new Set(slots)].map(planBoard)),
  ])

  return { date: day, events, timeBlocks, due, boards }
}
