/**
 * Схемы входа. Лежат отдельно от `http.ts`, потому что их читает и MCP-сервер, а он
 * поднимается вне Next: за `NextResponse` в стороннем процессе тянется полфреймворка.
 */
import { z } from 'zod'

/** Заголовок сервис сам обрежет и проверит: схема следит только за формой запроса. */
export const titleBody = z.object({ title: z.string() })

/**
 * Позиция списка после броска: соседи по доске. Ранга здесь нет и не будет — его считает
 * сервис. Хотя бы один сосед обязателен: без него схема совпала бы с любым объектом
 * и перехватила бы чужие тела запроса.
 */
const listMoveBody = z
  .object({
    prevListId: z.uuid().nullable().optional(),
    nextListId: z.uuid().nullable().optional(),
  })
  .refine((body) => 'prevListId' in body || 'nextListId' in body, {
    error: 'ожидается хотя бы один сосед: {prevListId} или {nextListId}',
  })

/** Правка списка: переименование, переезд в архив и обратно, перестановка на доске. */
export const patchBody = z.union(
  [titleBody, z.object({ archived: z.boolean() }), listMoveBody],
  { error: 'ожидается {title}, {archived} или {prevListId}/{nextListId}' },
)

/**
 * Позиция карточки после броска: список-приёмник и соседи. Ранга здесь нет и не будет —
 * его считает сервис, инвариант 2.
 */
export const moveBody = z.object({
  listId: z.uuid(),
  prevCardId: z.uuid().nullable().optional(),
  nextCardId: z.uuid().nullable().optional(),
})

/** Описание сервис сам обрежет; `null` и пустая строка одинаково стирают его. */
const describeBody = z.object({ description: z.string().nullable() })

/** Срок: дату и время сервис сам сведёт с часовым поясом, `null` снимает срок. */
export const dueInput = z
  .object({ date: z.string(), time: z.string().nullable().optional() })
  .nullable()

const dueBody = z.object({ due: dueInput })

/** Правка карточки: то же, что у списка, плюс описание, срок и перемещение внутри доски. */
export const cardPatchBody = z.union(
  [
    titleBody,
    describeBody,
    dueBody,
    z.object({ dueDone: z.boolean() }),
    z.object({ archived: z.boolean() }),
    moveBody,
  ],
  { error: 'ожидается {title}, {description}, {due}, {dueDone}, {archived} или {listId}' },
)

/** Перенос карточки: только список-приёмник. Место — конец списка, ранг считает сервис. */
export const transferBody = z.object({ listId: z.uuid() })

/** Новая метка доски: имя бывает пустым, цвет сервис сверяет с набором. */
export const labelBody = z.object({ name: z.string(), color: z.string() })

/** Правка метки: имя, цвет или оба сразу. */
export const labelPatchBody = z
  .object({ name: z.string().optional(), color: z.string().optional() })
  .refine((body) => body.name !== undefined || body.color !== undefined, {
    error: 'ожидается {name}, {color} или оба',
  })

/** Правка пункта чек-листа: заголовок, отметка либо перестановка внутри карточки. */
export const checklistItemPatchBody = z.union(
  [
    titleBody,
    z.object({ done: z.boolean() }),
    z.object({
      checklistId: z.uuid(),
      prevItemId: z.uuid().nullable().optional(),
      nextItemId: z.uuid().nullable().optional(),
    }),
  ],
  { error: 'ожидается {title}, {done} или {checklistId}' },
)

/**
 * Правка календаря: цвет, видимость или оба сразу. Цвет сервис сверяет с форматом,
 * `null` возвращает календарь к цвету аккаунта.
 */
export const calendarPatchBody = z
  .object({ color: z.string().nullable().optional(), visible: z.boolean().optional() })
  .refine((body) => body.color !== undefined || body.visible !== undefined, {
    error: 'ожидается {color}, {visible} или оба',
  })

/** Правка аккаунта: пока только цвет, которым красятся все его события. */
export const accountPatchBody = z.object({ color: z.string() })

/**
 * Время события с клиента. Пара дат у события на весь день и пара моментов у обычного
 * разведены схемой: смешанная пара до сервиса не доходит. Границы сверяет сервис.
 */
const eventTimes = z.union(
  [
    z.object({ allDay: z.literal(true), startDate: z.string(), endDate: z.string() }),
    z.object({ allDay: z.literal(false), startsAt: z.string(), endsAt: z.string() }),
  ],
  { error: 'ожидается {allDay, startDate, endDate} или {allDay, startsAt, endsAt}' },
)

/** Новое событие: календарь, название и время. Название сервис сам обрежет. */
export const eventBody = z.object({
  calendarId: z.uuid(),
  title: z.string(),
  times: eventTimes,
})

/** Правка события: название, описание, время — по отдельности или вместе. */
export const eventPatchBody = z
  .object({
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    times: eventTimes.optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined || body.description !== undefined || body.times !== undefined,
    { error: 'ожидается {title}, {description}, {times} или всё сразу' },
  )

/** Тайм-блок под карточку: карточка и пара моментов. Границы сверяет сервис. */
export const timeBlockBody = z.object({
  cardId: z.uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
})

/** Зеркало тайм-блока: календарь, в котором его показывать, либо `null` — не показывать. */
const mirrorBody = z.object({ calendarId: z.uuid().nullable() })

/**
 * Правка тайм-блока: перенос с растягиванием либо зеркало в Google. Пара границ всегда
 * приходит целиком — промежуточного состояния у блока нет.
 */
export const timeBlockPatchBody = z.union(
  [z.object({ startsAt: z.string(), endsAt: z.string() }), mirrorBody],
  { error: 'ожидается {startsAt, endsAt} или {calendarId}' },
)

/** Новая задача: список, название и срок датой. Форму срока сверяет сервис. */
export const taskBody = z.object({
  taskListId: z.uuid(),
  title: z.string(),
  due: z.string().nullable().optional(),
})

/**
 * Правка задачи Google: название, заметки, срок, отметка выполнения — по отдельности или
 * вместе. Срок — голая дата либо `null`, форму сверяет сервис; времени у него нет.
 */
export const taskPatchBody = z
  .object({
    title: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    due: z.string().nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.notes !== undefined ||
      body.due !== undefined ||
      body.completed !== undefined,
    { error: 'ожидается {title}, {notes}, {due}, {completed} или всё сразу' },
  )
