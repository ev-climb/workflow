// метки приехали из Trello именами цветов, а не значениями; светлые и тёмные варианты
// (green_light, green_dark) сводим к основному
const PALETTE: Record<string, { hex: string; name: string }> = {
  green: { hex: '#4bce97', name: 'зелёный' },
  yellow: { hex: '#e2b203', name: 'жёлтый' },
  orange: { hex: '#faa53d', name: 'оранжевый' },
  red: { hex: '#f87168', name: 'красный' },
  purple: { hex: '#9f8fef', name: 'фиолетовый' },
  blue: { hex: '#579dff', name: 'синий' },
  sky: { hex: '#6cc3e0', name: 'голубой' },
  lime: { hex: '#94c748', name: 'салатовый' },
  pink: { hex: '#e774bb', name: 'розовый' },
  black: { hex: '#8590a2', name: 'серый' },
}

const base = (color: string): string => color.replace(/_(light|dark)$/, '')

export function labelColor(color: string): string {
  return PALETTE[base(color)]?.hex ?? '#6b7280'
}

/** Подпись цвета для выбора: без неё метка отличается от соседней только на глаз. */
export function labelColorName(color: string): string {
  return PALETTE[base(color)]?.name ?? color
}

/** Выбор цвета для новой метки: варианты из Trello сюда не входят, только основные. */
export const LABEL_COLORS = Object.entries(PALETTE).map(([id, { name }]) => ({ id, name }))

export const isLabelColor = (value: string): boolean => Object.hasOwn(PALETTE, value)
