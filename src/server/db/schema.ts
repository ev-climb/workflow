import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { CalendarMode } from '../../lib/calendar-grid.ts'

// ранги сравниваются побайтно: локаль базы (en_US.utf8 и любая другая на glibc) ставит
// 'a0' раньше 'A1', а fractional-indexing строит ключи в расчёте на порядок байтов.
// Локально musl-совместимая alpine это скрывает — на glibc порядок карточек развалился бы
const rankText = customType<{ data: string; driverData: string }>({
  dataType: () => 'text collate "C"',
})

const pk = () => uuid().primaryKey().defaultRandom()
const tstz = () => timestamp({ withTimezone: true })
const createdAt = () => tstz().notNull().defaultNow()
const updatedAt = () => tstz().notNull().defaultNow()

export const boards = pgTable(
  'boards',
  {
    id: pk(),
    title: text().notNull(),
    rank: rankText().notNull(),
    // источник импорта; идентификатор Trello первичным ключом не становится
    trelloId: text(),
    archivedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('boards_rank_key').on(t.rank),
    uniqueIndex('boards_trello_id_key').on(t.trelloId),
  ],
)

export const lists = pgTable(
  'lists',
  {
    id: pk(),
    boardId: uuid()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    rank: rankText().notNull(),
    wipLimit: integer(),
    archivedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('lists_board_id_rank_key').on(t.boardId, t.rank),
    check('lists_wip_limit_positive', sql`${t.wipLimit} is null or ${t.wipLimit} > 0`),
  ],
)

export const cards = pgTable(
  'cards',
  {
    id: pk(),
    listId: uuid()
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    // Markdown, в отличие от описания события Google — оно приходит разметкой HTML
    description: text(),
    rank: rankText().notNull(),
    dueAt: tstz(),
    // осмысленно только при заполненном dueAt: срок бывает и одной датой, без времени
    dueHasTime: boolean().notNull().default(true),
    dueDone: boolean().notNull().default(false),
    archivedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('cards_list_id_rank_key').on(t.listId, t.rank),
    index('cards_due_at_idx').on(t.dueAt),
  ],
)

export const labels = pgTable(
  'labels',
  {
    id: pk(),
    boardId: uuid()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    // у Trello метка бывает без названия, только цветом — отсюда пустая строка вместо null
    name: text().notNull(),
    color: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('labels_board_id_name_color_key').on(t.boardId, t.name, t.color)],
)

export const cardLabels = pgTable(
  'card_labels',
  {
    cardId: uuid()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    labelId: uuid()
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ name: 'card_labels_pkey', columns: [t.cardId, t.labelId] }),
    index('card_labels_label_id_idx').on(t.labelId),
  ],
)

export const checklists = pgTable(
  'checklists',
  {
    id: pk(),
    cardId: uuid()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    rank: rankText().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('checklists_card_id_rank_key').on(t.cardId, t.rank)],
)

export const checklistItems = pgTable(
  'checklist_items',
  {
    id: pk(),
    checklistId: uuid()
      .notNull()
      .references(() => checklists.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    done: boolean().notNull().default(false),
    rank: rankText().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('checklist_items_checklist_id_rank_key').on(t.checklistId, t.rank)],
)

export const attachments = pgTable(
  'attachments',
  {
    id: pk(),
    cardId: uuid()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    // путь относительно ATTACHMENTS_DIR: абсолютных путей в базе нет, каталог переезжает
    path: text().notNull(),
    sizeBytes: integer().notNull(),
    mimeType: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('attachments_card_id_idx').on(t.cardId)],
)

export const googleAccounts = pgTable(
  'google_accounts',
  {
    id: pk(),
    email: text().notNull(),
    // цвет всех событий аккаунта; календарь внутри него перебивает своим, если задан
    color: text(),
    refreshTokenEncrypted: text().notNull(),
    accessTokenEncrypted: text(),
    accessTokenExpiresAt: tstz(),
    needsReauth: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('google_accounts_email_key').on(t.email)],
)

export const googleCalendars = pgTable(
  'google_calendars',
  {
    id: pk(),
    accountId: uuid()
      .notNull()
      .references(() => googleAccounts.id, { onDelete: 'cascade' }),
    googleCalendarId: text().notNull(),
    title: text().notNull(),
    // пусто — берётся цвет аккаунта; из Google не заполняется: там основные календари
    // разных аккаунтов приходят одним и тем же цветом
    color: text(),
    // права из calendarList: owner, writer, reader, freeBusyReader. Пусто у строк,
    // заведённых до того, как мы стали их спрашивать
    accessRole: text(),
    visible: boolean().notNull().default(true),
    syncToken: text(),
    syncedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('google_calendars_account_id_google_calendar_id_key').on(
      t.accountId,
      t.googleCalendarId,
    ),
  ],
)

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: pk(),
    calendarId: uuid()
      .notNull()
      .references(() => googleCalendars.id, { onDelete: 'cascade' }),
    googleEventId: text().notNull(),
    title: text(),
    descriptionHtml: text(),
    startsAt: tstz(),
    endsAt: tstz(),
    allDay: boolean().notNull().default(false),
    // mode: 'string' обязателен: Date здесь означал бы разбор в часовом поясе процесса
    // и сдвиг события на весь день на сутки
    startDate: date({ mode: 'string' }),
    endDate: date({ mode: 'string' }),
    etag: text(),
    googleUpdatedAt: tstz(),
    status: text().notNull().default('confirmed'),
    // идентификатор серии на стороне Google, а не ссылка на нашу строку
    recurringEventId: text(),
    // ADR-004: серия правится только в Google, и ссылку туда даёт он сам
    htmlLink: text(),
    deletedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('calendar_events_calendar_id_google_event_id_key').on(
      t.calendarId,
      t.googleEventId,
    ),
    index('calendar_events_starts_at_idx').on(t.startsAt),
    index('calendar_events_start_date_idx').on(t.startDate),
    index('calendar_events_recurring_event_id_idx').on(t.recurringEventId),
    check('calendar_events_status', sql`${t.status} in ('confirmed', 'tentative', 'cancelled')`),
    // инвариант 3: заполнена ровно одна пара времени.
    // end_date у Google исключающая, а равную start_date он принимает и возвращает как есть —
    // такое событие имеет нулевую длину, поэтому выправляется при импорте, а не хранится
    check(
      'calendar_events_one_time_pair',
      sql`(${t.allDay}
             and ${t.startDate} is not null and ${t.endDate} is not null
             and ${t.startsAt} is null and ${t.endsAt} is null
             and ${t.endDate} > ${t.startDate})
          or (not ${t.allDay}
             and ${t.startsAt} is not null and ${t.endsAt} is not null
             and ${t.startDate} is null and ${t.endDate} is null
             and ${t.endsAt} >= ${t.startsAt})`,
    ),
  ],
)

export const googleTaskLists = pgTable(
  'google_task_lists',
  {
    id: pk(),
    accountId: uuid()
      .notNull()
      .references(() => googleAccounts.id, { onDelete: 'cascade' }),
    googleTaskListId: text().notNull(),
    title: text().notNull(),
    // ADR-012: sync-токена в Tasks нет, догон идёт по updatedMin. Метка берётся из
    // серверного `updated` последней виденной задачи, а не по нашим часам
    updatedMin: tstz(),
    syncedAt: tstz(),
    deletedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('google_task_lists_account_id_google_task_list_id_key').on(
      t.accountId,
      t.googleTaskListId,
    ),
  ],
)

export const googleTasks = pgTable(
  'google_tasks',
  {
    id: pk(),
    accountId: uuid()
      .notNull()
      .references(() => googleAccounts.id, { onDelete: 'cascade' }),
    // ADR-012: список — обычное поле, а не часть ключа. При переезде задачи между списками
    // её идентификатор в Google не меняется, а из исходного списка она исчезает бесследно
    taskListId: uuid()
      .notNull()
      .references(() => googleTaskLists.id, { onDelete: 'cascade' }),
    googleTaskId: text().notNull(),
    title: text(),
    notes: text(),
    // инвариант 3: срок — дата, и через часовой пояс она не идёт. Времени у него нет и в
    // источнике: `due` со временем возвращается из Tasks с обнулённым временем
    due: date({ mode: 'string' }),
    // ADR-012: выполнение — это status, а не hidden; hidden означает «Google убрал с глаз»
    status: text().notNull().default('needsAction'),
    completedAt: tstz(),
    etag: text(),
    googleUpdatedAt: tstz(),
    webViewLink: text(),
    deletedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('google_tasks_account_id_google_task_id_key').on(t.accountId, t.googleTaskId),
    index('google_tasks_task_list_id_idx').on(t.taskListId),
    index('google_tasks_due_idx').on(t.due),
    check('google_tasks_status', sql`${t.status} in ('needsAction', 'completed')`),
  ],
)

export const timeBlocks = pgTable(
  'time_blocks',
  {
    id: pk(),
    cardId: uuid()
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    calendarId: uuid().references(() => googleCalendars.id, { onDelete: 'set null' }),
    googleEventId: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('time_blocks_card_id_idx').on(t.cardId),
    index('time_blocks_starts_at_idx').on(t.startsAt),
    check('time_blocks_positive_length', sql`${t.endsAt} > ${t.startsAt}`),
    // зеркало в Google — либо целиком, либо никак: календарь без события ничего не адресует
    check(
      'time_blocks_mirror_complete',
      sql`(${t.calendarId} is null) = (${t.googleEventId} is null)`,
    ),
  ],
)

export const workspaceState = pgTable(
  'workspace_state',
  {
    id: integer().primaryKey().default(1),
    topBoardId: uuid().references(() => boards.id, { onDelete: 'set null' }),
    bottomBoardId: uuid().references(() => boards.id, { onDelete: 'set null' }),
    topBoardRatio: real().notNull().default(0.5),
    calendarMode: text().$type<CalendarMode>().notNull().default('week'),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('workspace_state_single_row', sql`${t.id} = 1`),
    check('workspace_state_calendar_mode', sql`${t.calendarMode} in ('day', 'week')`),
    check('workspace_state_top_board_ratio', sql`${t.topBoardRatio} > 0 and ${t.topBoardRatio} < 1`),
  ],
)
