import { MINUTES_IN_DAY } from './calendar-grid'

/**
 * Цель календаря. Она одна на весь календарь, а день и время срока он считает по своей
 * сетке: dnd-kit сообщает выбранную цель тактом позже самого движения, и подсказка под
 * курсором отставала бы от курсора на день.
 */
export const DUE_DROP = { type: 'due' } as const
export const DUE_DROP_ID = 'due'

/** Цель календаря среди целей стола: у доски в данных лежит `DragData`. */
export function isDueDrop(data: unknown): data is typeof DUE_DROP {
  return typeof data === 'object' && data !== null && (data as { type?: string }).type === 'due'
}

export type Point = { x: number; y: number }

let pointer: Point | null = null

/**
 * Слежение за указателем на время жеста. Точка нужна своя: у dnd-kit она посчитана
 * вместе с прокруткой, случившейся за время жеста. Доске так и надо — её содержимое
 * едет вместе со скроллом, — а календарь стоит на месте, и та же поправка уводит
 * бросок на соседний день.
 */
export function trackPointer(): () => void {
  // точка прошлого жеста цели не выбирает: до первого движения курсор считается неизвестным
  pointer = null

  const track = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY }
  }

  // на погружении: dnd-kit слушает документ, а выбор цели должен считаться уже по новой точке
  window.addEventListener('pointermove', track, true)
  return () => window.removeEventListener('pointermove', track, true)
}

export const pointerAt = (): Point | null => pointer

type Box = { left: number; right: number; top: number; bottom: number }

/** Накрывает ли узел точку. Мерки снимаются на месте: сетку за время жеста могли прокрутить. */
export function covers(node: { getBoundingClientRect(): Box } | null, at: Point): boolean {
  if (!node) return false

  const box = node.getBoundingClientRect()
  return at.x >= box.left && at.x <= box.right && at.y >= box.top && at.y <= box.bottom
}

/**
 * День колонки под точкой. Клетки сетки одинаковой ширины, поэтому день считается долей
 * ширины, а не перебором узлов. Точка вне сетки — `null`: бросок мимо календаря.
 */
export function dayAt(
  node: { getBoundingClientRect(): Box } | null,
  at: Point,
  days: readonly string[],
): string | null {
  if (!node || days.length === 0 || !covers(node, at)) return null

  const box = node.getBoundingClientRect()
  const index = Math.floor(((at.x - box.left) / (box.right - box.left)) * days.length)
  return days[Math.min(Math.max(index, 0), days.length - 1)]
}

/** Шаг, к которому притягивается время броска: мышью в минуту всё равно не попасть. */
export const DROP_STEP = 15

/**
 * Время броска в минутах от полуночи: доля дневной колонки, притянутая к шагу вниз.
 * Вниз, а не к ближайшему шагу: сетка размечена часами, и точка под линией часа — это
 * начало часа, а не конец предыдущего. За сутки срок не уезжает даже с промахом мимо
 * колонки: последний шаг дня и есть предел.
 */
export function dropMinutes(offset: number, height: number): number {
  if (height <= 0) return 0

  const minutes = (offset / height) * MINUTES_IN_DAY
  const snapped = Math.floor(minutes / DROP_STEP) * DROP_STEP
  return Math.min(Math.max(snapped, 0), MINUTES_IN_DAY - DROP_STEP)
}

/** Минуты от полуночи временем на часах: в таком виде время срока принимает сервис. */
export function dropTime(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}
