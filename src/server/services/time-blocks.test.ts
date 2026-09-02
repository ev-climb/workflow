import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.ts'
import { calendarEvents, googleAccounts, googleCalendars } from '../db/schema.ts'
import type { GoogleEvent } from '../google/events.ts'
import { archiveList, createBoard, createList } from './boards.ts'
import { archiveCard, createCard } from './cards.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import { listEvents } from './google-events.ts'
import {
  createTimeBlock,
  listTimeBlocks,
  mirrorTimeBlock,
  moveTimeBlock,
  removeTimeBlock,
  unmirrorTimeBlock,
} from './time-blocks.ts'

vi.mock('../google/events.ts', async (importActual) => {
  const actual = await importActual<typeof import('../google/events.ts')>()
  return { ...actual, insertEvent: vi.fn(), patchEvent: vi.fn(), deleteEvent: vi.fn() }
})
vi.mock('./google-accounts.ts', async (importActual) => {
  const actual = await importActual<typeof import('./google-accounts.ts')>()
  return { ...actual, accessTokenFor: vi.fn() }
})

const { insertEvent, patchEvent, deleteEvent } = vi.mocked(await import('../google/events.ts'))
const { accessTokenFor } = vi.mocked(await import('./google-accounts.ts'))

let listId = ''
let cardId = ''

beforeEach(async () => {
  vi.clearAllMocks()
  accessTokenFor.mockResolvedValue('ya29.access')
  insertEvent.mockResolvedValue(googleEvent())

  const board = await createBoard({ title: 'Работа' })
  listId = (await createList({ boardId: board.id, title: 'Сегодня' })).id
  cardId = (await createCard({ listId, title: 'Починить пуши' })).id
})

function googleEvent(patch: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    googleEventId: 'mirror-1',
    status: 'confirmed',
    title: 'Починить пуши',
    descriptionHtml: null,
    etag: null,
    googleUpdatedAt: null,
    recurringEventId: null,
    htmlLink: null,
    times: null,
    ...patch,
  }
}

/** Календарь Google под зеркало: своего аккаунта у тайм-блока нет, он берётся у календаря. */
async function calendar(title = 'Личный', googleCalendarId = 'me@gmail.com') {
  const [account] = await db
    .insert(googleAccounts)
    .values({ email: googleCalendarId, refreshTokenEncrypted: 'шифротекст' })
    .returning({ id: googleAccounts.id })

  const [row] = await db
    .insert(googleCalendars)
    .values({ accountId: account.id, googleCalendarId, title })
    .returning({ id: googleCalendars.id })

  return row.id
}

const at = (iso: string) => new Date(iso)

async function block(startsAt: string, endsAt: string, card = cardId) {
  return await createTimeBlock({ cardId: card, startsAt: at(startsAt), endsAt: at(endsAt) })
}

describe('createTimeBlock', () => {
  it('заводит блок под живую карточку', async () => {
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:30:00Z')

    const blocks = await listTimeBlocks('2026-09-02', '2026-09-02')
    expect(blocks).toEqual([
      {
        id: created.id,
        cardId,
        cardTitle: 'Починить пуши',
        boardId: expect.any(String),
        boardTitle: 'Работа',
        startsAt: at('2026-09-02T09:00:00Z'),
        endsAt: at('2026-09-02T10:30:00Z'),
        calendarId: null,
      },
    ])
  })

  it('не заводит блок нулевой и отрицательной длины', async () => {
    await expect(block('2026-09-02T09:00:00Z', '2026-09-02T09:00:00Z')).rejects.toBeInstanceOf(
      InvalidInputError,
    )
    await expect(block('2026-09-02T10:00:00Z', '2026-09-02T09:00:00Z')).rejects.toBeInstanceOf(
      InvalidInputError,
    )
  })

  it('не заводит блок под негодный момент', async () => {
    await expect(block('какое-то время', '2026-09-02T10:00:00Z')).rejects.toBeInstanceOf(
      InvalidInputError,
    )
  })

  it('не заводит блок под чужую и под заархивированную карточку', async () => {
    await expect(
      block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z', '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundError)

    await archiveCard(cardId)
    await expect(block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('listTimeBlocks', () => {
  it('отдаёт блок, задевающий окно хотя бы краем, и пропускает соседний', async () => {
    const crossing = await block('2026-09-01T21:00:00Z', '2026-09-02T00:30:00Z')
    await block('2026-09-04T09:00:00Z', '2026-09-04T10:00:00Z')

    const blocks = await listTimeBlocks('2026-09-02', '2026-09-03')
    expect(blocks.map((b) => b.id)).toEqual([crossing.id])
  })

  it('режет окно по московским суткам, а не по UTC', async () => {
    // 23:00 второго по-московски — ещё второе, 00:30 третьего — уже третье
    const evening = await block('2026-09-02T20:00:00Z', '2026-09-02T20:30:00Z')
    await block('2026-09-02T21:30:00Z', '2026-09-02T22:00:00Z')

    const blocks = await listTimeBlocks('2026-09-02', '2026-09-02')
    expect(blocks.map((b) => b.id)).toEqual([evening.id])
  })

  it('идёт по времени начала', async () => {
    const later = await block('2026-09-02T15:00:00Z', '2026-09-02T16:00:00Z')
    const earlier = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')

    const blocks = await listTimeBlocks('2026-09-02', '2026-09-02')
    expect(blocks.map((b) => b.id)).toEqual([earlier.id, later.id])
  })

  it('не отдаёт блоки заархивированной карточки и заархивированного списка', async () => {
    await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')
    await archiveCard(cardId)
    expect(await listTimeBlocks('2026-09-02', '2026-09-02')).toEqual([])

    const other = (await createCard({ listId, title: 'Другая' })).id
    await block('2026-09-02T11:00:00Z', '2026-09-02T12:00:00Z', other)
    await archiveList(listId)
    expect(await listTimeBlocks('2026-09-02', '2026-09-02')).toEqual([])
  })

  it('не берёт кривое окно', async () => {
    await expect(listTimeBlocks('второе сентября', '2026-09-02')).rejects.toBeInstanceOf(
      InvalidInputError,
    )
    await expect(listTimeBlocks('2026-09-03', '2026-09-02')).rejects.toBeInstanceOf(
      InvalidInputError,
    )
  })
})

describe('moveTimeBlock', () => {
  it('двигает обе границы разом', async () => {
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')

    await moveTimeBlock(created.id, {
      startsAt: at('2026-09-03T12:00:00Z'),
      endsAt: at('2026-09-03T14:00:00Z'),
    })

    expect(await listTimeBlocks('2026-09-02', '2026-09-02')).toEqual([])
    const [moved] = await listTimeBlocks('2026-09-03', '2026-09-03')
    expect(moved.startsAt).toEqual(at('2026-09-03T12:00:00Z'))
    expect(moved.endsAt).toEqual(at('2026-09-03T14:00:00Z'))
  })

  it('не переворачивает блок и не двигает несуществующий', async () => {
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')

    await expect(
      moveTimeBlock(created.id, {
        startsAt: at('2026-09-02T10:00:00Z'),
        endsAt: at('2026-09-02T09:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidInputError)

    await expect(
      moveTimeBlock('00000000-0000-4000-8000-000000000000', {
        startsAt: at('2026-09-02T09:00:00Z'),
        endsAt: at('2026-09-02T10:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('removeTimeBlock', () => {
  it('снимает блок с сетки насовсем', async () => {
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')

    await removeTimeBlock(created.id)

    expect(await listTimeBlocks('2026-09-02', '2026-09-02')).toEqual([])
    await expect(removeTimeBlock(created.id)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('зеркало тайм-блока в Google', () => {
  it('заводит событие с названием карточки и временем блока', async () => {
    const calendarId = await calendar()
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')

    await mirrorTimeBlock(created.id, calendarId)

    expect(insertEvent).toHaveBeenCalledWith('ya29.access', 'me@gmail.com', {
      title: 'Починить пуши',
      times: {
        allDay: false,
        startsAt: at('2026-09-02T09:00:00Z'),
        endsAt: at('2026-09-02T10:00:00Z'),
        startDate: null,
        endDate: null,
      },
    })
    const [mirrored] = await listTimeBlocks('2026-09-02', '2026-09-02')
    expect(mirrored.calendarId).toBe(calendarId)
  })

  it('смена календаря переносит зеркало, а не заводит второе', async () => {
    const first = await calendar()
    const second = await calendar('Рабочий', 'work@gmail.com')
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')

    await mirrorTimeBlock(created.id, first)
    insertEvent.mockResolvedValue(googleEvent({ googleEventId: 'mirror-2' }))
    await mirrorTimeBlock(created.id, second)

    expect(deleteEvent).toHaveBeenCalledWith('ya29.access', 'me@gmail.com', 'mirror-1')
    const [moved] = await listTimeBlocks('2026-09-02', '2026-09-02')
    expect(moved.calendarId).toBe(second)
  })

  it('снятое зеркало уходит из Google, а блок остаётся на сетке', async () => {
    const calendarId = await calendar()
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')
    await mirrorTimeBlock(created.id, calendarId)

    await unmirrorTimeBlock(created.id)

    expect(deleteEvent).toHaveBeenCalledWith('ya29.access', 'me@gmail.com', 'mirror-1')
    const [kept] = await listTimeBlocks('2026-09-02', '2026-09-02')
    expect(kept.calendarId).toBeNull()
  })

  it('удаление блока убирает и зеркало', async () => {
    const calendarId = await calendar()
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')
    await mirrorTimeBlock(created.id, calendarId)

    await removeTimeBlock(created.id)

    expect(deleteEvent).toHaveBeenCalledWith('ya29.access', 'me@gmail.com', 'mirror-1')
    expect(await listTimeBlocks('2026-09-02', '2026-09-02')).toEqual([])
  })

  it('перенос блока двигает и зеркало', async () => {
    const calendarId = await calendar()
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')
    await mirrorTimeBlock(created.id, calendarId)

    await moveTimeBlock(created.id, {
      startsAt: at('2026-09-02T12:00:00Z'),
      endsAt: at('2026-09-02T13:00:00Z'),
    })

    expect(patchEvent).toHaveBeenCalledWith(
      'ya29.access',
      'me@gmail.com',
      'mirror-1',
      {
        times: {
          allDay: false,
          startsAt: at('2026-09-02T12:00:00Z'),
          endsAt: at('2026-09-02T13:00:00Z'),
          startDate: null,
          endDate: null,
        },
      },
      null,
    )
  })

  it('зеркало не двоится на сетке: блок его уже рисует', async () => {
    const calendarId = await calendar()
    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')
    await mirrorTimeBlock(created.id, calendarId)

    // синхронизация приносит зеркало обратно обычным событием
    await db.insert(calendarEvents).values({
      calendarId,
      googleEventId: 'mirror-1',
      title: 'Починить пуши',
      startsAt: at('2026-09-02T09:00:00Z'),
      endsAt: at('2026-09-02T10:00:00Z'),
    })

    expect(await listEvents('2026-09-02', '2026-09-02')).toEqual([])
  })

  it('блока нет — зеркалом заниматься нечем', async () => {
    const calendarId = await calendar()
    const missing = '00000000-0000-4000-8000-000000000000'

    await expect(mirrorTimeBlock(missing, calendarId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(unmirrorTimeBlock(missing)).rejects.toBeInstanceOf(NotFoundError)

    const created = await block('2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z')
    await expect(mirrorTimeBlock(created.id, missing)).rejects.toBeInstanceOf(NotFoundError)
  })
})
