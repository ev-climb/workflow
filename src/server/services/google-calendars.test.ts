import { describe, expect, it } from 'vitest'
import { db } from '../db/client.ts'
import { googleAccounts } from '../db/schema.ts'
import type { GoogleCalendarEntry } from '../google/calendars.ts'
import { InvalidInputError, NotFoundError } from './errors.ts'
import { listGoogleCalendars, saveCalendarList, updateGoogleCalendar } from './google-calendars.ts'

async function account(email = 'me@gmail.com'): Promise<string> {
  const [row] = await db
    .insert(googleAccounts)
    .values({ email, refreshTokenEncrypted: 'шифротекст' })
    .returning({ id: googleAccounts.id })
  return row.id
}

function entry(patch: Partial<GoogleCalendarEntry> = {}): GoogleCalendarEntry {
  return {
    googleCalendarId: 'me@gmail.com',
    title: 'me@gmail.com',
    color: '#9fe1e7',
    selected: true,
    accessRole: 'owner',
    primary: true,
    ...patch,
  }
}

describe('календари аккаунта', () => {
  it('один и тот же календарь в двух аккаунтах — две записи', async () => {
    const holidays = entry({ googleCalendarId: 'ru.russian#holiday', title: 'Праздники России' })
    await saveCalendarList(await account('first@gmail.com'), [holidays])
    await saveCalendarList(await account('second@gmail.com'), [holidays])

    const calendars = await listGoogleCalendars()
    expect(calendars).toHaveLength(2)
    expect(new Set(calendars.map((calendar) => calendar.accountId)).size).toBe(2)
  })

  it('права из Google доходят до выбора календаря', async () => {
    const id = await account()
    await saveCalendarList(id, [
      entry(),
      entry({
        googleCalendarId: 'ru.russian#holiday',
        title: 'Праздники России',
        accessRole: 'reader',
      }),
    ])

    const calendars = await listGoogleCalendars()
    expect(
      Object.fromEntries(calendars.map((calendar) => [calendar.title, calendar.writable])),
    ).toEqual({ 'me@gmail.com': true, 'Праздники России': false })
  })

  it('отобранные права обновляются, а цвет и видимость остаются выбранными', async () => {
    const id = await account()
    await saveCalendarList(id, [entry()])
    const [before] = await listGoogleCalendars()
    await updateGoogleCalendar(before.id, { color: '#9fe1e7', visible: false })

    await saveCalendarList(id, [entry({ accessRole: 'reader' })])

    const [after] = await listGoogleCalendars()
    expect(after).toMatchObject({ writable: false, color: '#9fe1e7', visible: false })
  })

  it('пустой список ничего не меняет', async () => {
    const id = await account()
    await saveCalendarList(id, [entry()])
    await saveCalendarList(id, [])

    expect(await listGoogleCalendars()).toHaveLength(1)
  })
})

describe('правка календаря', () => {
  it('цвет и видимость сохраняются', async () => {
    await saveCalendarList(await account(), [entry()])
    const [calendar] = await listGoogleCalendars()

    expect(await updateGoogleCalendar(calendar.id, { color: '#D50000' })).toMatchObject({
      color: '#d50000',
      visible: true,
    })
    expect(await updateGoogleCalendar(calendar.id, { visible: false })).toMatchObject({
      color: '#d50000',
      visible: false,
    })
  })

  it('цвет не из шестнадцатеричного формата — ошибка входа', async () => {
    await saveCalendarList(await account(), [entry()])
    const [calendar] = await listGoogleCalendars()

    await expect(updateGoogleCalendar(calendar.id, { color: 'красный' })).rejects.toThrow(
      InvalidInputError,
    )
    await expect(updateGoogleCalendar(calendar.id, { color: '#fff' })).rejects.toThrow(
      InvalidInputError,
    )
  })

  it('чужой идентификатор — не найдено', async () => {
    await expect(
      updateGoogleCalendar('00000000-0000-0000-0000-000000000000', { visible: true }),
    ).rejects.toThrow(NotFoundError)
  })
})
