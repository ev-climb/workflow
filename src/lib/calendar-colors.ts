/**
 * Цвет храним готовым `#rrggbb`, а не именем из набора, как у меток: набор — подсказка
 * для выбора, а не словарь, и сервис принимает любой шестнадцатеричный цвет.
 */
const PALETTE: { hex: string; name: string }[] = [
  { hex: '#7986cb', name: 'лавандовый' },
  { hex: '#039be5', name: 'синий' },
  { hex: '#33b679', name: 'зелёный' },
  { hex: '#0b8043', name: 'тёмно-зелёный' },
  { hex: '#f6bf26', name: 'жёлтый' },
  { hex: '#f4511e', name: 'оранжевый' },
  { hex: '#d50000', name: 'красный' },
  { hex: '#e67c73', name: 'розовый' },
  { hex: '#8e24aa', name: 'фиолетовый' },
  { hex: '#616161', name: 'серый' },
]

/** Ни у аккаунта, ни у календаря цвет не выбран — отрисовать событие чем-то всё равно надо. */
export const DEFAULT_CALENDAR_COLOR = '#616161'

/**
 * Очередь цветов для нового аккаунта: личное обычно голубое, рабочее жёлтое — с них и
 * начинаем. Занятые пропускаются, иначе два аккаунта совпали бы цветом и различать
 * события по источнику стало бы нечем.
 */
const ACCOUNT_ORDER = ['#039be5', '#f6bf26', '#33b679', '#8e24aa', '#f4511e', '#7986cb']

export function nextAccountColor(used: (string | null)[]): string {
  return ACCOUNT_ORDER.find((hex) => !used.includes(hex)) ?? DEFAULT_CALENDAR_COLOR
}

/** Цвет события: свой цвет календаря, иначе цвет аккаунта, иначе серый. */
export function paintOf(calendarColor: string | null, accountColor: string | null): string {
  return calendarColor ?? accountColor ?? DEFAULT_CALENDAR_COLOR
}

export const CALENDAR_COLORS = PALETTE

const HEX = /^#[0-9a-f]{6}$/

export const isCalendarColor = (value: string): boolean => HEX.test(value)

/** Подпись в выборе цвета. Цвет вне набора называть нечем — показываем сам код. */
export function calendarColorName(hex: string): string {
  return PALETTE.find((color) => color.hex === hex)?.name ?? hex
}
