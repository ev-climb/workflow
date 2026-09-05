// инвариант 3: в базе UTC, на экране Europe/Moscow. Часовой пояс задан явно и здесь же —
// иначе сервер и браузер отрисовали бы разное время и гидратация разошлась бы
const ZONE = 'Europe/Moscow'

const SAME_YEAR = new Intl.DateTimeFormat('ru-RU', {
  timeZone: ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const SAME_YEAR_DAY = new Intl.DateTimeFormat('ru-RU', {
  timeZone: ZONE,
  day: 'numeric',
  month: 'short',
})

const OTHER_YEAR = new Intl.DateTimeFormat('ru-RU', {
  timeZone: ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const yearIn = (date: Date) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: ZONE, year: 'numeric' }).format(date)

/** Момент на экране: время внутри текущего года, одна дата — за его пределами. */
export function formatMoment(iso: string, now = new Date()): string {
  const date = new Date(iso)
  return yearIn(date) === yearIn(now) ? SAME_YEAR.format(date) : OTHER_YEAR.format(date)
}

/** Срок на экране: то же самое, но заданный одной датой рисуется без времени. */
export function formatDue(iso: string, hasTime: boolean, now = new Date()): string {
  if (hasTime) return formatMoment(iso, now)
  const date = new Date(iso)
  return yearIn(date) === yearIn(now) ? SAME_YEAR_DAY.format(date) : OTHER_YEAR.format(date)
}

const STAMP = new Intl.DateTimeFormat('ru-RU', { timeZone: ZONE, day: '2-digit', month: '2-digit' })

/** Короткая отметка «02.09» для угла заметки. За пределами года — с годом. */
export function formatStamp(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const year = yearIn(date)
  return year === yearIn(now) ? STAMP.format(date) : `${STAMP.format(date)}.${year.slice(2)}`
}

// `en-CA` даёт дату как ГГГГ-ММ-ДД, `h23` — полночь как 00, а не как 24
const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function partsOf(at: Date): Record<string, string> {
  return Object.fromEntries(PARTS.formatToParts(at).map((part) => [part.type, part.value]))
}

/** Момент, разобранный по-московски: то, что показывают поля правки срока. */
export function moscowParts(iso: string): { date: string; time: string } {
  const p = partsOf(new Date(iso))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/** Насколько московское время опережает UTC в этот момент. */
function offsetMs(at: Date): number {
  const p = partsOf(at)
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return shown - Math.floor(at.getTime() / 60_000) * 60_000
}

/**
 * Момент по московским дате и времени. Смещение берётся в точке-догадке и уточняется
 * вторым проходом: на переводе часов первая попытка промахивается мимо своей зоны.
 */
export function momentInMoscow(date: string, time: string | null): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = (time ?? '00:00').split(':').map(Number)
  const shown = Date.UTC(year, month - 1, day, hour, minute)
  if (Number.isNaN(shown)) return new Date(Number.NaN)

  const once = shown - offsetMs(new Date(shown))
  return new Date(shown - offsetMs(new Date(once)))
}

/**
 * Отмеченный выполненным срок просроченным не считается. Срок без времени держит весь
 * свой день: сравниваются московские даты, а не моменты, иначе он краснел бы с полуночи.
 */
export function isOverdue(
  iso: string,
  dueDone: boolean,
  hasTime: boolean,
  now = Date.now(),
): boolean {
  if (dueDone) return false
  if (hasTime) return new Date(iso).getTime() < now
  return moscowParts(iso).date < moscowParts(new Date(now).toISOString()).date
}
