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
