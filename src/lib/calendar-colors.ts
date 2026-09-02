/**
 * Цвет календаря храним готовым `#rrggbb`, а не именем из набора, как у меток: Google
 * отдаёт цвет календаря сразу шестнадцатеричным, и своего набора имён у него нет —
 * приводить чужой цвет к нашему словарю значило бы терять его.
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

/** Календарь без цвета на стороне Google — редкость, но отрисовать его чем-то надо. */
export const DEFAULT_CALENDAR_COLOR = '#616161'

export const CALENDAR_COLORS = PALETTE

const HEX = /^#[0-9a-f]{6}$/

export const isCalendarColor = (value: string): boolean => HEX.test(value)

/** Подпись в выборе цвета. Цвет, пришедший из Google, в набор обычно не попадает. */
export function calendarColorName(hex: string): string {
  return PALETTE.find((color) => color.hex === hex)?.name ?? 'как в Google'
}
