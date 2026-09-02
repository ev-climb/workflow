import { DEFAULT_CALENDAR_COLOR } from '../../lib/calendar-colors.ts'
import { refuse } from './oauth.ts'

const CALENDAR_LIST = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'

export type GoogleCalendarEntry = {
  googleCalendarId: string
  title: string
  /** Цвет календаря в Google, `#rrggbb`. Начальный: дальше его выбирает пользователь. */
  color: string
  /** Отмечен ли календарь в самом Google — с него начинается наша видимость. */
  selected: boolean
  /** `owner`, `writer`, `reader` или `freeBusyReader`: в чужой подписной не записать. */
  accessRole: string
  primary: boolean
}

type ListItem = {
  id: string
  summary?: string
  summaryOverride?: string
  backgroundColor?: string
  selected?: boolean
  hidden?: boolean
  accessRole?: string
  deleted?: boolean
  primary?: boolean
}

/**
 * Календари аккаунта целиком, включая подписные вроде «Праздников России»: колонка
 * сводит все, а прячет их пользователь. Проверено живьём — в ответе есть `backgroundColor`,
 * `selected` и `primary`, а `hidden` и `deleted` Google опускает вместо `false`.
 */
export async function fetchCalendarList(accessToken: string): Promise<GoogleCalendarEntry[]> {
  const entries: GoogleCalendarEntry[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(CALENDAR_LIST)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
    const body = await response.text()
    if (!response.ok) throw refuse('список календарей', response.status, body)

    const page = JSON.parse(body) as { items?: ListItem[]; nextPageToken?: string }
    for (const item of page.items ?? []) {
      if (item.deleted) continue
      entries.push({
        googleCalendarId: item.id,
        title: item.summaryOverride ?? item.summary ?? item.id,
        color: item.backgroundColor ?? DEFAULT_CALENDAR_COLOR,
        selected: item.selected === true && item.hidden !== true,
        accessRole: item.accessRole ?? 'reader',
        primary: item.primary === true,
      })
    }

    pageToken = page.nextPageToken
  } while (pageToken)

  return entries
}
