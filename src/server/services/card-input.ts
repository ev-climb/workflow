import { moscowParts } from '../../lib/dates.ts'
import { InvalidInputError } from './errors.ts'

export type CardInput = {
  title: string
  due: { date: string; time: string | null } | null
  labels: string[]
}

const OFFSETS: Record<string, number> = { сегодня: 0, завтра: 1, послезавтра: 2 }

const WEEKDAYS: Record<string, number> = {
  воскресенье: 0,
  вс: 0,
  понедельник: 1,
  пн: 1,
  вторник: 2,
  вт: 2,
  среда: 3,
  ср: 3,
  четверг: 4,
  чт: 4,
  пятница: 5,
  пт: 5,
  суббота: 6,
  сб: 6,
}

const DAY = 86_400_000
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const DOTTED = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/
const CLOCK = /^(\d{1,2}):(\d{2})$/

const pad = (value: string | number) => String(value).padStart(2, '0')

/** Дата как полночь UTC. Календарь считается в UTC: часовой пояс сюда не заходит. */
function dayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Ближайший такой день недели, всегда в будущем: «пятница» в пятницу — через неделю. */
function nextWeekday(today: string, weekday: number): string {
  const ahead = ((weekday - new Date(dayOf(today)).getUTCDay() + 6) % 7) + 1
  return dateOf(dayOf(today) + ahead * DAY)
}

function clock(word: string): string | null {
  const match = CLOCK.exec(word)
  return match ? `${pad(match[1])}:${match[2]}` : null
}

/**
 * Дата срока из одного слова. Существование даты здесь не проверяется — это делает
 * общий разбор срока в `cards.ts`, чтобы не заводить вторую такую проверку.
 */
function dueDate(word: string, today: string): string | null {
  const lower = word.toLowerCase()

  const offset = OFFSETS[lower]
  if (offset !== undefined) return dateOf(dayOf(today) + offset * DAY)

  const weekday = WEEKDAYS[lower]
  if (weekday !== undefined) return nextWeekday(today, weekday)

  if (ISO.test(word)) return word

  const dotted = DOTTED.exec(word)
  if (!dotted) return null

  const [, day, month, year] = dotted
  if (year) return `${year}-${pad(month)}-${pad(day)}`

  // год не назван — берём ближайший, в котором эта дата ещё не прошла
  const thisYear = `${today.slice(0, 4)}-${pad(month)}-${pad(day)}`
  return thisYear >= today ? thisYear : `${Number(today.slice(0, 4)) + 1}-${pad(month)}-${pad(day)}`
}

const today = () => moscowParts(new Date().toISOString()).date

/**
 * Строка быстрого создания: `Починить пуши !пятница 18:00 #баг`. Слово с `!` задаёт срок,
 * слово с `#` — метку доски, остальное складывается в заголовок. Время идёт отдельным
 * словом следом за датой либо вместо неё — тогда срок ставится на сегодня.
 * Разбор живёт в сервисе, а не в поле ввода: тем же путём пойдёт MCP.
 */
export function parseCardInput(raw: string, now = today()): CardInput {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  const title: string[] = []
  const labels: string[] = []
  let due: CardInput['due'] = null

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]

    if (word.length > 1 && word.startsWith('#')) {
      labels.push(word.slice(1))
      continue
    }

    if (word.length > 1 && word.startsWith('!')) {
      const value = word.slice(1)
      const time = clock(value)
      const date = time ? now : dueDate(value, now)
      if (!date) throw new InvalidInputError(`карточка: не понял срок «${value}»`)

      const separate = time ? null : clock(words[i + 1] ?? '')
      if (separate) i += 1
      due = { date, time: time ?? separate }
      continue
    }

    title.push(word)
  }

  return { title: title.join(' '), due, labels }
}
