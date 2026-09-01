// инвариант 3: в базе UTC, на экране Europe/Moscow. Часовой пояс задан явно и здесь же —
// иначе сервер и браузер отрисовали бы разное время и гидратация разошлась бы
const SAME_YEAR = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const OTHER_YEAR = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const yearIn = (date: Date) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', year: 'numeric' }).format(date)

/** Момент на экране: время внутри текущего года, одна дата — за его пределами. */
export function formatMoment(iso: string, now = new Date()): string {
  const date = new Date(iso)
  return yearIn(date) === yearIn(now) ? SAME_YEAR.format(date) : OTHER_YEAR.format(date)
}

/** Отмеченный выполненным срок просроченным не считается. */
export function isOverdue(iso: string, dueDone: boolean, now = Date.now()): boolean {
  return !dueDone && new Date(iso).getTime() < now
}
