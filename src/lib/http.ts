import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ConflictError,
  InvalidInputError,
  NotFoundError,
  UnauthorizedError,
} from '@/server/services/errors'

const CODES: [abstract new (...args: never[]) => Error, number][] = [
  [InvalidInputError, 400],
  [UnauthorizedError, 401],
  [NotFoundError, 404],
  [ConflictError, 409],
]

/**
 * Сервис бросает типизированную ошибку, код выбирает обработчик маршрута — инвариант 2.
 * Чужая ошибка пробрасывается дальше: пятисотка с трассировкой честнее, чем ровный JSON,
 * который спрячет поломку.
 */
export function errorResponse(error: unknown): NextResponse {
  for (const [type, status] of CODES) {
    if (error instanceof type) return NextResponse.json({ error: error.message }, { status })
  }
  throw error
}

/** Кривой JSON и несошедшаяся схема — такая же ошибка входа, как и всё остальное. */
export async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new InvalidInputError('тело запроса не разобралось как JSON')
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error))
  return parsed.data
}

export const isUuid = (value: string): boolean => z.uuid().safeParse(value).success

/** Кривой идентификатор — 400, а не пятисотка от базы на неверном формате uuid. */
export function uuidParam(value: string, what: string): string {
  if (!isUuid(value)) throw new InvalidInputError(`идентификатор ${what} не uuid`)
  return value
}

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
const moveBody = z.object({
  listId: z.uuid(),
  prevCardId: z.uuid().nullable().optional(),
  nextCardId: z.uuid().nullable().optional(),
})

/** Описание сервис сам обрежет; `null` и пустая строка одинаково стирают его. */
const describeBody = z.object({ description: z.string().nullable() })

/** Срок: дату и время сервис сам сведёт с часовым поясом, `null` снимает срок. */
const dueBody = z.object({
  due: z.object({ date: z.string(), time: z.string().nullable().optional() }).nullable(),
})

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

/** Правка календаря: цвет, видимость или оба сразу. Цвет сервис сверяет с форматом. */
export const calendarPatchBody = z
  .object({ color: z.string().optional(), visible: z.boolean().optional() })
  .refine((body) => body.color !== undefined || body.visible !== undefined, {
    error: 'ожидается {color}, {visible} или оба',
  })

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
