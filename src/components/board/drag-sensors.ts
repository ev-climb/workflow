import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type PointerSensorOptions,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { PointerEvent } from 'react'

/**
 * PointerSensor без касаний. Палец он подхватывает наравне с мышью: сдвинувшись на пять
 * пикселей, палец тащил бы карточку, а не листал доску.
 */
class NoTouchPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: PointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return false
        onActivation?.({ event })
        return true
      },
    },
  ]
}

/**
 * Мышь начинает перенос после сдвига: без порога щелчок по карточке или пункту считался бы
 * переносом. Палец — после удержания на месте: короткий сдвиг остаётся прокруткой.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(NoTouchPointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}
