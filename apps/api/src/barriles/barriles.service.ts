import { AlertSeverity, AlertType, BarrelStatus, BarrelStopStatus, EventType, Role, RouteStatus } from '@prisma/client'
import { generateQRBase64 } from '../utils/qr'
import { prisma } from '../db/client'
import { AppError } from '../common/errors'
import { validateTransition } from '../services/barrelStateMachine'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createEvent(
  barrelId: string,
  type: EventType,
  fromStatus: BarrelStatus | null,
  toStatus: BarrelStatus,
  userId: string,
  extras: { routeId?: string; deliveryPointId?: string; lat?: number; lng?: number; notes?: string } = {}
) {
  return prisma.barrelEvent.create({
    data: { barrelId, type, fromStatus, toStatus, userId, ...extras },
  })
}

async function findBarrelOrFail(id: string) {
  const barrel = await prisma.barrel.findUnique({ where: { id } })
  if (!barrel) throw new AppError('Barril no encontrado', 404, 'BARREL_NOT_FOUND')
  return barrel
}

function computeUbicacion(
  status: BarrelStatus,
  routeStopBarrels: Array<{ routeStop: { deliveryPoint: { name: string }; route: { transportist: { name: string } } } }>,
  routeBarrels: Array<{ route: { transportist: { name: string } } }>
): string {
  switch (status) {
    case BarrelStatus.EN_BODEGA:
    case BarrelStatus.EN_ALISTAMIENTO:
    case BarrelStatus.DEVUELTO:
      return 'CEDI'
    case BarrelStatus.EN_MANTENIMIENTO:
      return 'Taller'
    case BarrelStatus.ENTREGADO:
      return routeStopBarrels[0]?.routeStop?.deliveryPoint?.name ?? '—'
    case BarrelStatus.EN_TRANSPORTE:
      return routeBarrels[0]?.route?.transportist?.name ?? '—'
    case BarrelStatus.EN_RECOGIDA:
      return routeStopBarrels[0]?.routeStop?.route?.transportist?.name ?? '—'
    default:
      return '—'
  }
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function listBarrels(filters: {
  status?: BarrelStatus
  product?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const { status, product, search, page = 1, pageSize = 20 } = filters
  const skip = (page - 1) * pageSize

  const where = {
    ...(status ? { status } : {}),
    ...(product ? { product: { contains: product, mode: 'insensitive' as const } } : {}),
    ...(search
      ? {
          OR: [
            { id: { contains: search, mode: 'insensitive' as const } },
            { qrCode: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [barrelRows, total] = await Promise.all([
    prisma.barrel.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        routeStopBarrels: {
          where: { status: { in: [BarrelStopStatus.ENTREGADO, BarrelStopStatus.RECOGIDO_VACIO] } },
          include: {
            routeStop: {
              include: {
                deliveryPoint: { select: { name: true } },
                route: { select: { transportist: { select: { name: true } } } },
              },
            },
          },
          orderBy: { deliveredAt: 'desc' },
          take: 1,
        },
        routeBarrels: {
          include: {
            route: { select: { transportist: { select: { name: true } }, date: true } },
          },
          orderBy: { route: { date: 'desc' } },
          take: 1,
        },
      },
    }),
    prisma.barrel.count({ where }),
  ])

  const items = barrelRows.map(({ routeStopBarrels, routeBarrels, ...barrel }) => ({
    ...barrel,
    ubicacion: computeUbicacion(barrel.status, routeStopBarrels, routeBarrels),
  }))

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

export async function getBarrel(id: string) {
  const barrel = await prisma.barrel.findUnique({
    where: { id },
    include: { events: { orderBy: { timestamp: 'asc' } }, createdBy: { select: { id: true, name: true } } },
  })
  if (!barrel) throw new AppError('Barril no encontrado', 404, 'BARREL_NOT_FOUND')
  return barrel
}

export async function scanBarrel(qrCode: string, userId: string) {
  const existing = await prisma.barrel.findUnique({
    where: { qrCode },
    include: { events: { orderBy: { timestamp: 'desc' }, take: 5 } },
  })
  if (existing) return { barrel: existing, created: false }

  const barrel = await prisma.barrel.create({
    data: {
      qrCode,
      status: BarrelStatus.EN_BODEGA,
      capacity: 30,
      manufactureDate: new Date(),
      createdById: userId,
    },
  })

  await createEvent(barrel.id, EventType.REGISTRO, null, BarrelStatus.EN_BODEGA, userId, {
    notes: 'Registro automático por primer escaneo',
  })

  return { barrel, created: true }
}

export async function updateBarrel(
  id: string,
  data: {
    capacity?: number
    manufactureDate?: Date
    lastMaintenanceDate?: Date
    maxLifeYears?: number
    product?: string
    notes?: string
  }
) {
  await findBarrelOrFail(id)
  return prisma.barrel.update({ where: { id }, data })
}

// ── Alert helper (fire-and-forget) ────────────────────────────────────────────

function fireIrregularAlert(message: string, barrelId?: string, routeId?: string): void {
  prisma.alert
    .create({
      data: {
        type: AlertType.NOVEDAD_EN_RUTA,
        severity: AlertSeverity.WARNING,
        message,
        targetRoles: [Role.ADMIN, Role.SUPERVISOR],
        ...(barrelId ? { barrelId } : {}),
        ...(routeId ? { routeId } : {}),
      },
    })
    .catch(err => console.error('[Alert] Error creando alerta de transición irregular:', err))
}

// ── Transition executor ───────────────────────────────────────────────────────

async function executeTransition(
  id: string,
  toStatus: BarrelStatus,
  userId: string,
  extras: { routeId?: string; deliveryPointId?: string; lat?: number; lng?: number; notes?: string } = {}
): Promise<{ barrel: Awaited<ReturnType<typeof prisma.barrel.update>>; warning?: string }> {
  const barrel = await findBarrelOrFail(id)
  const { result, eventType } = validateTransition(barrel.status, toStatus)

  const [updated] = await Promise.all([
    prisma.barrel.update({ where: { id }, data: { status: toStatus } }),
    createEvent(barrel.id, eventType, barrel.status, toStatus, userId, extras),
  ])

  if (result.irregular && result.warning) {
    fireIrregularAlert(result.warning, barrel.id, extras.routeId)
    return { barrel: updated, warning: result.warning }
  }

  return { barrel: updated }
}

export async function sendToMantenimiento(id: string, userId: string, notes?: string) {
  return executeTransition(id, BarrelStatus.EN_MANTENIMIENTO, userId, { notes })
}

export async function retornoMantenimiento(id: string, userId: string, notes?: string) {
  const barrel = await findBarrelOrFail(id)
  const { result, eventType } = validateTransition(barrel.status, BarrelStatus.EN_BODEGA)

  const [updated] = await Promise.all([
    prisma.barrel.update({
      where: { id },
      data: { status: BarrelStatus.EN_BODEGA, lastMaintenanceDate: new Date() },
    }),
    createEvent(barrel.id, eventType, barrel.status, BarrelStatus.EN_BODEGA, userId, { notes }),
  ])

  if (result.irregular && result.warning) {
    fireIrregularAlert(result.warning, barrel.id)
    return { barrel: updated, warning: result.warning }
  }

  return { barrel: updated }
}

export async function darDeBaja(id: string, userId: string, notes?: string) {
  return executeTransition(id, BarrelStatus.BAJA, userId, { notes })
}

export async function recibirBarril(id: string, userId: string, notes?: string) {
  const { barrel: updated, warning } = await executeTransition(id, BarrelStatus.EN_BODEGA, userId, { notes })

  // If this barrel was picked up as part of a route, auto-close the route when
  // all empties from that route have now been received at bodega.
  const routeLink = await prisma.routeStopBarrel.findFirst({
    where: { barrelId: id, status: BarrelStopStatus.RECOGIDO_VACIO },
    include: { routeStop: { select: { routeId: true } } },
  })

  if (routeLink) {
    const routeId = routeLink.routeStop.routeId
    const route = await prisma.route.findUnique({ where: { id: routeId } })

    if (route && (route.status === RouteStatus.EN_CURSO || route.status === RouteStatus.CON_NOVEDAD)) {
      const allPickedUp = await prisma.routeStopBarrel.findMany({
        where: { routeStop: { routeId }, status: BarrelStopStatus.RECOGIDO_VACIO },
        include: { barrel: { select: { status: true } } },
      })

      // All RECOGIDO_VACIO barrels must now be EN_BODEGA (barrel X was just updated in DB)
      const allReturned = allPickedUp.length > 0 &&
        allPickedUp.every(rsb => rsb.barrel.status === BarrelStatus.EN_BODEGA)

      if (allReturned) {
        await prisma.route.update({
          where: { id: routeId },
          data: { status: RouteStatus.COMPLETADA, arrivedAt: new Date() },
        })
      }
    }
  }

  return { barrel: updated, warning }
}

export async function getBarrelQr(id: string) {
  const barrel = await findBarrelOrFail(id)
  const base64 = await generateQRBase64(barrel.id)
  return {
    id: barrel.id,
    qrCode: barrel.qrCode,
    qrImage: `data:image/png;base64,${base64}`,
  }
}

export async function revertirUltimoEvento(barrelId: string, userId: string) {
  // 1. Fetch the most recent event for this barrel
  const lastEvent = await prisma.barrelEvent.findFirst({
    where: { barrelId },
    orderBy: { timestamp: 'desc' },
  })
  if (!lastEvent) throw new AppError('El barril no tiene eventos registrados', 400, 'NO_EVENTS')

  // 2. Validate the 5-minute window
  const ageMs = Date.now() - lastEvent.timestamp.getTime()
  if (ageMs > 5 * 60 * 1000) {
    throw new AppError(
      'Solo se puede revertir el último escaneo en los primeros 5 minutos',
      400,
      'REVERT_WINDOW_EXPIRED'
    )
  }

  // 3. The previous status is stored in the event's fromStatus
  const previousStatus = lastEvent.fromStatus
  if (previousStatus === null) {
    throw new AppError('No se puede revertir el evento de registro inicial', 400, 'CANNOT_REVERT_REGISTRATION')
  }

  // 4. Read current barrel status for the reversal event
  const barrel = await findBarrelOrFail(barrelId)
  const currentStatus = barrel.status

  // 5. Update barrel status back to what it was before the last event
  const [updated] = await Promise.all([
    prisma.barrel.update({ where: { id: barrelId }, data: { status: previousStatus } }),
    createEvent(barrelId, EventType.NOVEDAD, currentStatus, previousStatus, userId, {
      notes: 'Reversión de escaneo — operador',
    }),
  ])

  return updated
}
