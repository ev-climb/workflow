// метки приехали из Trello именами цветов, а не значениями; светлые и тёмные варианты
// (green_light, green_dark) сводим к основному
const PALETTE: Record<string, string> = {
  green: '#4bce97',
  yellow: '#e2b203',
  orange: '#faa53d',
  red: '#f87168',
  purple: '#9f8fef',
  blue: '#579dff',
  sky: '#6cc3e0',
  lime: '#94c748',
  pink: '#e774bb',
  black: '#8590a2',
}

export function labelColor(color: string): string {
  return PALETTE[color.replace(/_(light|dark)$/, '')] ?? '#6b7280'
}

/** Выбор цвета для новой метки: варианты из Trello сюда не входят, только основные. */
export const LABEL_COLORS = Object.keys(PALETTE)

export const isLabelColor = (value: string): boolean => Object.hasOwn(PALETTE, value)
