import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { toEventTimes } from '../../lib/calendar-view.ts'
import { moscowParts } from '../../lib/dates.ts'
import { dueInput, eventBody, eventPatchBody, moveBody } from '../../lib/schemas.ts'
import type { BoardCard, BoardWithLists, LabelSummary } from '../services/boards.ts'
import { getBoard, listBoards } from '../services/boards.ts'
import type { CardDetail, CardDue, CardHit } from '../services/cards.ts'
import {
  archiveCard,
  createCardFromText,
  describeCard,
  getCard,
  moveCard,
  renameCard,
  searchCards,
  setCardDue,
} from '../services/cards.ts'
import { addChecklistItem, listChecklists, updateChecklistItem } from '../services/checklists.ts'
import { InvalidInputError, ServiceError } from '../services/errors.ts'
import type {
  CalendarEvent,
  CalendarEventDetails,
  EventChanges,
} from '../services/google-events.ts'
import { createEvent, getEvent, listEvents, updateEvent } from '../services/google-events.ts'
import { attachLabel, detachLabel } from '../services/labels.ts'
import type { DayPlan } from '../services/plan.ts'
import { planDay } from '../services/plan.ts'
import type { TimeBlock } from '../services/time-blocks.ts'

/**
 * Срок наружу: момент разбирается на московские дату и время, и время показывается только
 * если оно у срока значимо. Отдавать голый ISO нельзя — читающий увидит UTC и ошибётся
 * на три часа.
 */
function dueOut(
  dueAt: Date | null,
  hasTime: boolean,
  done: boolean,
): { due: string; dueDone: boolean } | Record<string, never> {
  if (dueAt === null) return {}
  const { date, time } = moscowParts(dueAt.toISOString())
  return { due: hasTime ? `${date} ${time}` : date, dueDone: done }
}

/**
 * У метки, приехавшей из Trello, названия может не быть вовсе — только цвет. Пустая
 * строка наружу бесполезна: читающий не отличит одну такую метку от другой.
 */
function labelName(label: LabelSummary): string {
  return label.name || label.color
}

function cardOut(card: BoardCard): Record<string, unknown> {
  return {
    id: card.id,
    title: card.title,
    ...dueOut(card.dueAt, card.dueHasTime, card.dueDone),
    ...(card.labels.length ? { labels: card.labels.map(labelName) } : {}),
    ...(card.checklistTotal ? { checklist: `${card.checklistDone}/${card.checklistTotal}` } : {}),
  }
}

/** Доска целиком без описаний карточек: сотня карточек должна укладываться в тысячи токенов. */
function boardOut(board: BoardWithLists): Record<string, unknown> {
  return {
    id: board.id,
    title: board.title,
    labels: board.labels.map((label) => ({ id: label.id, name: labelName(label) })),
    lists: board.lists.map((list) => ({
      id: list.id,
      title: list.title,
      ...(list.wipLimit === null ? {} : { wipLimit: list.wipLimit }),
      cards: list.cards.map(cardOut),
    })),
  }
}

function hitOut(hit: CardHit): Record<string, unknown> {
  return {
    id: hit.id,
    title: hit.title,
    board: hit.boardTitle,
    list: hit.listTitle,
    ...dueOut(hit.dueAt, hit.dueHasTime, hit.dueDone),
  }
}

async function detailOut(cardId: string): Promise<Record<string, unknown>> {
  const card: CardDetail = await getCard(cardId)
  const checklists = await listChecklists(cardId)

  return {
    id: card.id,
    title: card.title,
    board: card.boardTitle,
    list: card.listTitle,
    listId: card.listId,
    ...dueOut(card.dueAt, card.dueHasTime, card.dueDone),
    ...(card.description === null ? {} : { description: card.description }),
    ...(card.labels.length
      ? { labels: card.labels.map((label) => ({ id: label.id, name: labelName(label) })) }
      : {}),
    ...(checklists.length
      ? {
          checklists: checklists.map((checklist) => ({
            id: checklist.id,
            title: checklist.title,
            items: checklist.items.map((item) => ({
              id: item.id,
              title: item.title,
              done: item.done,
            })),
          })),
        }
      : {}),
  }
}

function moment(at: Date): string {
  const { date, time } = moscowParts(at.toISOString())
  return `${date} ${time}`
}

/** Событие наружу: московское время строкой, у события на весь день — только даты. */
function eventOut(event: CalendarEvent): Record<string, unknown> {
  const when =
    event.allDay || event.startsAt === null || event.endsAt === null
      ? { allDay: true, from: event.startDate, to: event.endDate }
      : { from: moment(event.startsAt), to: moment(event.endsAt) }

  return {
    id: event.id,
    title: event.title,
    ...when,
    ...(event.recurringEventId === null ? {} : { recurring: true }),
    ...(event.taskId === null ? {} : { task: true, taskCompleted: event.taskCompleted }),
  }
}

function eventDetailsOut(event: CalendarEventDetails): Record<string, unknown> {
  return {
    ...eventOut(event),
    calendar: event.calendarTitle,
    ...(event.description === null ? {} : { description: event.description }),
  }
}

function timeBlockOut(block: TimeBlock): Record<string, unknown> {
  return {
    id: block.id,
    card: block.cardTitle,
    board: block.boardTitle,
    from: moment(block.startsAt),
    to: moment(block.endsAt),
  }
}

function dueCardOut(card: CardDue): Record<string, unknown> {
  return {
    id: card.id,
    title: card.title,
    board: card.boardTitle,
    ...dueOut(card.dueAt, card.dueHasTime, card.dueDone),
  }
}

function planOut(plan: DayPlan): Record<string, unknown> {
  return {
    date: plan.date,
    events: plan.events.map(eventOut),
    timeBlocks: plan.timeBlocks.map(timeBlockOut),
    due: plan.due.map(dueCardOut),
    boards: plan.boards.map((board) => ({
      id: board.id,
      title: board.title,
      inWork: board.inWork.map((list) => ({
        id: list.id,
        title: list.title,
        cards: list.cards.map(cardOut),
      })),
      ...(board.lists ? { lists: board.lists } : {}),
    })),
  }
}

export type ToolDef = {
  name: string
  title: string
  description: string
  input: z.ZodType
  run: (raw: unknown) => Promise<unknown>
}

/**
 * Инструмент: схема входа, вызов сервиса, компактный ответ — и ничего больше (ADR-006).
 * Вход разбирается здесь же, а не в обёртке SDK, чтобы негодный аргумент приходил такой
 * же ошибкой входа, как и по HTTP, и чтобы `run` можно было позвать из теста напрямую.
 */
function tool<S extends z.ZodType>(
  name: string,
  meta: { title: string; description: string; input: S },
  run: (input: z.output<S>) => Promise<unknown>,
): ToolDef {
  return {
    name,
    title: meta.title,
    description: meta.description,
    input: meta.input,
    run: async (raw) => {
      const parsed = meta.input.safeParse(raw)
      if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error))
      return run(parsed.data)
    },
  }
}

const cardId = z.uuid()

export const TOOLS: ToolDef[] = [
  tool(
    'list_boards',
    {
      title: 'Доски',
      description: 'Список досок. Карточек и колонок не отдаёт — за ними get_board.',
      input: z.object({}),
    },
    async () => (await listBoards()).map((board) => ({ id: board.id, title: board.title })),
  ),

  tool(
    'get_board',
    {
      title: 'Доска',
      description:
        'Колонки доски с карточками: идентификатор, заголовок, метки, срок, прогресс ' +
        'чек-листа. Описаний карточек здесь нет — за описанием get_card.',
      input: z.object({ boardId: z.uuid() }),
    },
    async ({ boardId }) => boardOut(await getBoard(boardId)),
  ),

  tool(
    'get_card',
    {
      title: 'Карточка',
      description: 'Карточка целиком: описание, метки, чек-листы, срок и место на доске.',
      input: z.object({ cardId }),
    },
    ({ cardId: id }) => detailOut(id),
  ),

  tool(
    'search_cards',
    {
      title: 'Поиск карточек',
      description:
        'Живые карточки по тексту (заголовок и описание), метке, доске и окну срока. ' +
        'Границы срока — московские даты вида 2026-09-02. Выдача обрезана: по умолчанию ' +
        '50 карточек, больше 200 не отдаётся.',
      input: z.object({
        text: z.string().optional(),
        boardId: z.uuid().optional(),
        labelId: z.uuid().optional(),
        dueFrom: z.string().optional(),
        dueTo: z.string().optional(),
        limit: z.number().int().optional(),
      }),
    },
    async (filter) => (await searchCards(filter)).map(hitOut),
  ),

  tool(
    'create_card',
    {
      title: 'Новая карточка',
      description:
        'Карточка в конец колонки. Текст разбирается той же строкой быстрого создания, ' +
        'что и в окне: «Починить пуши !пятница #баг» — срок после «!», метка доски ' +
        'после «#». Метки, которой на доске нет, не появится.',
      input: z.object({ listId: z.uuid(), text: z.string() }),
    },
    async ({ listId, text }) => detailOut((await createCardFromText({ listId, text })).id),
  ),

  tool(
    'update_card',
    {
      title: 'Правка карточки',
      description:
        'Заголовок, описание, срок и метки карточки. Срок — московские дата и время, ' +
        '`null` снимает его. Метки навешиваются и снимаются по идентификаторам с доски.',
      input: z
        .object({
          cardId,
          title: z.string().optional(),
          description: z.string().nullable().optional(),
          due: dueInput.optional(),
          addLabelIds: z.array(z.uuid()).optional(),
          removeLabelIds: z.array(z.uuid()).optional(),
        })
        .refine(
          (input) =>
            input.title !== undefined ||
            input.description !== undefined ||
            input.due !== undefined ||
            input.addLabelIds !== undefined ||
            input.removeLabelIds !== undefined,
          { error: 'править нечего: ожидается title, description, due или метки' },
        ),
    },
    async (input) => {
      if (input.title !== undefined) await renameCard(input.cardId, input.title)
      if (input.description !== undefined) await describeCard(input.cardId, input.description)
      if (input.due !== undefined) await setCardDue(input.cardId, input.due)
      for (const labelId of input.addLabelIds ?? []) await attachLabel(input.cardId, labelId)
      for (const labelId of input.removeLabelIds ?? []) await detachLabel(input.cardId, labelId)

      return detailOut(input.cardId)
    },
  ),

  tool(
    'move_card',
    {
      title: 'Перенос карточки',
      description:
        'Карточка встаёт в колонку между соседями: prevCardId — тот, за кем она встаёт, ' +
        'nextCardId — тот, перед кем. Оба необязательны: без них место в конце колонки. ' +
        'Колонка обязана быть на той же доске.',
      input: moveBody.extend({ cardId }),
    },
    async (input) => {
      const moved = await moveCard(input)
      const card = await getCard(moved.id)
      return { id: card.id, title: card.title, list: card.listTitle, board: card.boardTitle }
    },
  ),

  tool(
    'archive_card',
    {
      title: 'Карточку в архив',
      description: 'Мягкое удаление: карточка уходит с доски, но остаётся в архиве.',
      input: z.object({ cardId }),
    },
    async ({ cardId: id }) => {
      const card = await getCard(id)
      await archiveCard(id)
      return { id, title: card.title, archived: true }
    },
  ),

  tool(
    'add_checklist_item',
    {
      title: 'Пункт чек-листа',
      description:
        'Пункт в конец чек-листа карточки. Идентификатор чек-листа берётся из get_card. ' +
        'С `done: true` пункт сразу отмечается выполненным.',
      input: z.object({ checklistId: z.uuid(), title: z.string(), done: z.boolean().optional() }),
    },
    async ({ checklistId, title, done }) => {
      const created = await addChecklistItem({ checklistId, title })
      const item = done ? await updateChecklistItem(created.id, { done }) : created
      return { id: item.id, title: item.title, done: item.done }
    },
  ),

  tool(
    'list_events',
    {
      title: 'События календаря',
      description:
        'События видимых календарей всех аккаунтов в окне московских дат вида 2026-09-02, ' +
        'обе границы включительно.',
      input: z.object({ from: z.string(), to: z.string() }),
    },
    async ({ from, to }) => (await listEvents(from, to)).map(eventOut),
  ),

  tool(
    'create_event',
    {
      title: 'Новое событие',
      description:
        'Событие в выбранном календаре Google. Время — либо пара моментов ISO ' +
        '(allDay: false), либо пара дат (allDay: true), у которой правая граница ' +
        'исключающая: однодневное событие — это завтрашняя дата в endDate.',
      input: eventBody,
    },
    async (body) => {
      const created = await createEvent(body.calendarId, {
        title: body.title,
        times: toEventTimes(body.times),
      })
      return eventDetailsOut(await getEvent(created.eventId))
    },
  ),

  tool(
    'update_event',
    {
      title: 'Правка события',
      description:
        'Название, описание и время события. Правится вхождение, а не серия: у ' +
        'повторяющегося события правка задевает только этот экземпляр.',
      input: eventPatchBody.safeExtend({ eventId: z.uuid() }),
    },
    async (input) => {
      const changes: EventChanges = {}
      if (input.title !== undefined) changes.title = input.title
      if (input.description !== undefined) changes.description = input.description
      if (input.times) changes.times = toEventTimes(input.times)

      const written = await updateEvent(input.eventId, changes)
      if (written.goneInGoogle) return { id: input.eventId, goneInGoogle: true }

      return { ...eventDetailsOut(await getEvent(input.eventId)), conflict: written.conflict }
    },
  ),

  tool(
    'plan_day',
    {
      title: 'План дня',
      description:
        'Всё про один день одним вызовом: события календарей, тайм-блоки, сроки карточек ' +
        'на этот день и следующий, содержимое рабочих колонок обеих досок стола. ' +
        'День — московская дата вида 2026-09-02, по умолчанию сегодняшняя.',
      input: z.object({ date: z.string().optional() }),
    },
    async ({ date }) => planOut(await planDay(date)),
  ),
]

/**
 * Ошибка сервиса — это ответ инструмента, а не падение сервера: читающий должен увидеть
 * «карточки нет», а не оборванное соединение. Чужая ошибка летит дальше, как и в
 * `errorResponse`: пятисотка с трассировкой честнее ровного текста, прячущего поломку.
 */
export function registerTools(server: McpServer): void {
  for (const def of TOOLS) {
    server.registerTool(
      def.name,
      { title: def.title, description: def.description, inputSchema: def.input },
      async (args: unknown) => {
        try {
          const result = await def.run(args)
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
        } catch (error) {
          if (error instanceof ServiceError) {
            return { content: [{ type: 'text' as const, text: error.message }], isError: true }
          }
          throw error
        }
      },
    )
  }
}
