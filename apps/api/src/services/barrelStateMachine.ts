import { BarrelStatus, EventType } from '@prisma/client'
import { AppError } from '../common/errors'

type TransitionDef = { to: BarrelStatus; event: EventType }

const TRANSITIONS: Record<BarrelStatus, TransitionDef[]> = {
  EN_BODEGA: [
    { to: BarrelStatus.EN_ALISTAMIENTO, event: EventType.ALISTAMIENTO },
    { to: BarrelStatus.EN_MANTENIMIENTO, event: EventType.ENVIO_MANTENIMIENTO },
    { to: BarrelStatus.BAJA, event: EventType.DISPOSICION_FINAL },
  ],
  EN_ALISTAMIENTO: [
    { to: BarrelStatus.EN_TRANSPORTE, event: EventType.SALIDA_BODEGA },
    { to: BarrelStatus.BAJA, event: EventType.DISPOSICION_FINAL },
  ],
  EN_TRANSPORTE: [
    { to: BarrelStatus.ENTREGADO, event: EventType.ENTREGA_LLENO },
    { to: BarrelStatus.BAJA, event: EventType.DISPOSICION_FINAL },
  ],
  ENTREGADO: [
    { to: BarrelStatus.EN_RECOGIDA, event: EventType.RECOGIDA_VACIO },
    { to: BarrelStatus.BAJA, event: EventType.DISPOSICION_FINAL },
  ],
  EN_RECOGIDA: [
    { to: BarrelStatus.EN_BODEGA, event: EventType.RETORNO_BODEGA },
    { to: BarrelStatus.BAJA, event: EventType.DISPOSICION_FINAL },
  ],
  DEVUELTO: [
    { to: BarrelStatus.EN_BODEGA, event: EventType.RETORNO_BODEGA },
    { to: BarrelStatus.BAJA, event: EventType.DISPOSICION_FINAL },
  ],
  EN_MANTENIMIENTO: [
    { to: BarrelStatus.EN_BODEGA, event: EventType.RETORNO_MANTENIMIENTO },
    { to: BarrelStatus.BAJA, event: EventType.DISPOSICION_FINAL },
  ],
  BAJA: [],
}

export function assertTransition(from: BarrelStatus, to: BarrelStatus): EventType {
  const match = (TRANSITIONS[from] ?? []).find(t => t.to === to)
  if (!match) {
    throw new AppError(`Transición inválida: ${from} → ${to}`, 400, 'INVALID_TRANSITION')
  }
  return match.event
}

export function availableTransitions(from: BarrelStatus): TransitionDef[] {
  return TRANSITIONS[from] ?? []
}
