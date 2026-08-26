/** Доля высоты под верхнюю доску. Ниже границы слот схлопывается в полоску и границу нечем поймать. */
export const RATIO_MIN = 0.15
export const RATIO_MAX = 0.85

export const clampRatio = (value: number): number =>
  Math.min(RATIO_MAX, Math.max(RATIO_MIN, value))
