import { BarrelStatus, EventType } from '@prisma/client'

type TransitionDef = { to: BarrelStatus; event: EventType }

export type TransitionResult = { allowed: true; irregular: boolean; warning?: string }

// When a transition is irregular we still need an EventType to record the event.
// We map the target status to the most semantically appropriate event type.
const IRREGULAR_EVENT_FALLBACK: Record<BarrelStatus, EventType> = {
  EN_BODEGA: EventType.RETORNO_BODEGA,
  EN_ALISTAMIENTO: EventType.ALISTAMIENTO,
  EN_TRANSPORTE: EventType.SALIDA_BODEGA,
  ENTREGADO: EventType.ENTREGA_LLENO,
  EN_RECOGIDA: EventType.RECOGIDA_VACIO,
  DEVUELTO: EventType.RETORNO_BODEGA,
  EN_MANTENIMIENTO: EventType.ENVIO_MANTENIMIENTO,
  BAJA: EventType.DISPOSICION_FINAL,
}

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

/**
 * Validates a barrel state transition.
 * Always returns { allowed: true }. Regular transitions set irregular=false;
 * irregular transitions set irregular=true and include a warning message.
 * The caller is responsible for creating an alert when irregular=true.
 */
export function validateTransition(
  from: BarrelStatus,
  to: BarrelStatus
): { result: TransitionResult; eventType: EventType } {
  const match = (TRANSITIONS[from] ?? []).find(t => t.to === to)
  if (match) {
    return { result: { allowed: true, irregular: false }, eventType: match.event }
  }
  const warning = `Transición irregular: ${from} → ${to}`
  return {
    result: { allowed: true, irregular: true, warning },
    eventType: IRREGULAR_EVENT_FALLBACK[to] ?? EventType.NOVEDAD,
  }
}

/** @deprecated Use validateTransition instead */
export function assertTransition(from: BarrelStatus, to: BarrelStatus): EventType {
  const { eventType } = validateTransition(from, to)
  return eventType
}

export function availableTransitions(from: BarrelStatus): TransitionDef[] {
  return TRANSITIONS[from] ?? []
}
