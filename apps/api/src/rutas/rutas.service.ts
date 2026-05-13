import { BarrelStatus, BarrelStopStatus, EventType, RouteStatus, StopStatus } from '@prisma/client'
import { prisma } from '../db/client'
import { AppError } from '../common/errors'
import { assertTransition } from '../services/barrelStateMachine'
import { alertStream } from '../services/alertStream'

type StopInput = {
  deliveryPointId: string
  position: number
  barrels: Array<{ barrelId: string; product: string }>
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function findRouteOrFail(id: string) {
  const route = await prisma.route.findUnique({
    where: { id },
    include: {
      stops: {
        include: { barrels: true, deliveryPoint: true },
        orderBy: { position: 'asc' },
      },
    },
  })
  if (!route) throw new AppError('Ruta no encontrada', 404, 'ROUTE_NOT_FOUND')
  return route
}

async function createBarrelEvent(
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

// ── Service functions ─────────────────────────────────────────────────────────

export async function listRoutes(filters: {
  status?: RouteStatus
  date?: string
  transportistId?: string
  page?: number
  pageSize?: number
}) {
  const { status, date, transportistId, page = 1, pageSize = 20 } = filters
  const skip = (page - 1) * pageSize

  const where = {
    ...(status ? { status } : {}),
    ...(transportistId ? { transportistId } : {}),
    ...(date
      ? {
          date: {
            gte: new Date(`${date}T00:00:00.000Z`),
            lte: new Date(`${date}T23:59:59.999Z`),
          },
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.route.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { date: 'desc' },
      include: { transportist: { select: { id: true, name: true } }, stops: true },
    }),
    prisma.route.count({ where }),
  ])

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

export async function createRoute(
  data: {
    name: string
    date: Date
    transportistId: string
    vehiclePlate?: string
    stops: StopInput[]
  },
  userId: string
) {
  // Validate all barrels are EN_BODEGA
  const allBarrelIds = data.stops.flatMap(s => s.barrels.map(b => b.barrelId))
  const barrels = await prisma.barrel.findMany({ where: { id: { in: allBarrelIds } } })

  if (barrels.length !== allBarrelIds.length) {
    const found = new Set(barrels.map(b => b.id))
    const missing = allBarrelIds.filter(id => !found.has(id))
    throw new AppError(`Barriles no encontrados: ${missing.join(', ')}`, 404, 'BARREL_NOT_FOUND')
  }

  const notInBodega = barrels.filter(b => b.status !== BarrelStatus.EN_BODEGA)
  if (notInBodega.length > 0) {
    throw new AppError(
      `Barriles no disponibles (no están EN_BODEGA): ${notInBodega.map(b => `${b.id}(${b.status})`).join(', ')}`,
      409,
      'BARREL_NOT_AVAILABLE'
    )
  }

  // Create route
  const route = await prisma.route.create({
    data: {
      name: data.name,
      date: data.date,
      transportistId: data.transportistId,
      vehiclePlate: data.vehiclePlate,
      stops: {
        create: data.stops.map(stop => ({
          deliveryPointId: stop.deliveryPointId,
          position: stop.position,
          barrelsAssigned: stop.barrels.length,
          barrels: {
            create: stop.barrels.map(b => ({
              barrelId: b.barrelId,
              product: b.product,
            })),
          },
        })),
      },
    },
    include: { stops: { include: { barrels: true } } },
  })

  // Transition all barrels to EN_ALISTAMIENTO
  await Promise.all(
    barrels.map(b =>
      Promise.all([
        prisma.barrel.update({ where: { id: b.id }, data: { status: BarrelStatus.EN_ALISTAMIENTO } }),
        createBarrelEvent(b.id, EventType.ALISTAMIENTO, b.status, BarrelStatus.EN_ALISTAMIENTO, userId, {
          routeId: route.id,
        }),
      ])
    )
  )

  return route
}

export async function getRoute(id: string) {
  const route = await findRouteOrFail(id)
  // Add progress
  const totalBarrels = route.stops.reduce((n, s) => n + s.barrelsAssigned, 0)
  const delivered = route.stops.reduce((n, s) => n + s.barrelsDelivered, 0)
  const pickedUp = route.stops.reduce((n, s) => n + s.barrelsPickedUp, 0)
  return { ...route, progress: { totalBarrels, delivered, pickedUp } }
}

export async function updateRoute(
  id: string,
  data: { name?: string; date?: Date; vehiclePlate?: string; transportistId?: string }
) {
  const route = await findRouteOrFail(id)
  if (route.status !== RouteStatus.PLANIFICADA) {
    throw new AppError('Solo se pueden editar rutas PLANIFICADAS', 409, 'ROUTE_NOT_PLANIFICADA')
  }
  return prisma.route.update({ where: { id }, data })
}

export async function iniciarRuta(id: string, userId: string) {
  const route = await findRouteOrFail(id)
  if (route.status !== RouteStatus.PLANIFICADA) {
    throw new AppError('La ruta ya fue iniciada o no está planificada', 409, 'ROUTE_NOT_PLANIFICADA')
  }

  const allBarrelIds = route.stops.flatMap(s => s.barrels.map(b => b.barrelId))
  const barrels = await prisma.barrel.findMany({ where: { id: { in: allBarrelIds } } })

  await Promise.all([
    prisma.route.update({ where: { id }, data: { status: RouteStatus.EN_CURSO, departedAt: new Date() } }),
    ...barrels.map(b =>
      Promise.all([
        prisma.barrel.update({ where: { id: b.id }, data: { status: BarrelStatus.EN_TRANSPORTE } }),
        createBarrelEvent(b.id, EventType.SALIDA_BODEGA, b.status, BarrelStatus.EN_TRANSPORTE, userId, {
          routeId: id,
        }),
      ])
    ),
  ])

  return prisma.route.findUnique({ where: { id }, include: { stops: true } })
}

export async function entregarStop(
  routeId: string,
  stopId: string,
  barrelIds: string[],
  userId: string,
  lat?: number,
  lng?: number
) {
  const route = await findRouteOrFail(routeId)
  if (route.status !== RouteStatus.EN_CURSO && route.status !== RouteStatus.CON_NOVEDAD) {
    throw new AppError('La ruta no está en curso', 409, 'ROUTE_NOT_EN_CURSO')
  }

  const stop = route.stops.find(s => s.id === stopId)
  if (!stop) throw new AppError('Parada no encontrada en esta ruta', 404, 'STOP_NOT_FOUND')

  const stopBarrels = stop.barrels.filter(sb => barrelIds.includes(sb.barrelId))
  if (stopBarrels.length !== barrelIds.length) {
    throw new AppError('Algunos barriles no pertenecen a esta parada', 400, 'BARREL_NOT_IN_STOP')
  }

  const barrels = await prisma.barrel.findMany({ where: { id: { in: barrelIds } } })
  const notReady = barrels.filter(b => b.status !== BarrelStatus.EN_TRANSPORTE)
  if (notReady.length > 0) {
    throw new AppError(
      `Barriles no en EN_TRANSPORTE: ${notReady.map(b => b.id).join(', ')}`,
      409,
      'INVALID_TRANSITION'
    )
  }

  const now = new Date()
  await Promise.all([
    ...barrels.map(b =>
      Promise.all([
        prisma.barrel.update({ where: { id: b.id }, data: { status: BarrelStatus.ENTREGADO } }),
        createBarrelEvent(b.id, EventType.ENTREGA_LLENO, b.status, BarrelStatus.ENTREGADO, userId, {
          routeId,
          deliveryPointId: stop.deliveryPointId,
          lat,
          lng,
        }),
        prisma.routeStopBarrel.updateMany({
          where: { routeStopId: stopId, barrelId: b.id },
          data: { status: BarrelStopStatus.ENTREGADO, deliveredAt: now },
        }),
      ])
    ),
    prisma.routeStop.update({
      where: { id: stopId },
      data: {
        barrelsDelivered: { increment: barrelIds.length },
        lat,
        lng,
        deliveredAt: now,
      },
    }),
  ])

  // Check if stop is complete
  const updatedStop = await prisma.routeStop.findUnique({ where: { id: stopId } })
  if (updatedStop && updatedStop.barrelsDelivered >= updatedStop.barrelsAssigned) {
    await prisma.routeStop.update({ where: { id: stopId }, data: { status: StopStatus.COMPLETADA } })
  }

  return prisma.routeStop.findUnique({ where: { id: stopId }, include: { barrels: true } })
}

export async function recogerStop(
  routeId: string,
  stopId: string,
  barrelIds: string[],
  userId: string,
  lat?: number,
  lng?: number
) {
  const route = await findRouteOrFail(routeId)
  if (route.status !== RouteStatus.EN_CURSO && route.status !== RouteStatus.CON_NOVEDAD) {
    throw new AppError('La ruta no está en curso', 409, 'ROUTE_NOT_EN_CURSO')
  }

  const stop = route.stops.find(s => s.id === stopId)
  if (!stop) throw new AppError('Parada no encontrada en esta ruta', 404, 'STOP_NOT_FOUND')

  const barrels = await prisma.barrel.findMany({ where: { id: { in: barrelIds } } })
  const notReady = barrels.filter(b => b.status !== BarrelStatus.ENTREGADO)
  if (notReady.length > 0) {
    throw new AppError(
      `Barriles no en estado ENTREGADO: ${notReady.map(b => b.id).join(', ')}`,
      409,
      'INVALID_TRANSITION'
    )
  }

  const now = new Date()
  await Promise.all(
    barrels.map(b =>
      Promise.all([
        prisma.barrel.update({ where: { id: b.id }, data: { status: BarrelStatus.EN_RECOGIDA } }),
        createBarrelEvent(b.id, EventType.RECOGIDA_VACIO, b.status, BarrelStatus.EN_RECOGIDA, userId, {
          routeId,
          deliveryPointId: stop.deliveryPointId,
          lat,
          lng,
        }),
        prisma.routeStopBarrel.updateMany({
          where: { routeStopId: stopId, barrelId: b.id },
          data: { status: BarrelStopStatus.RECOGIDO_VACIO, pickedUpEmptyAt: now },
        }),
      ])
    )
  )

  await prisma.routeStop.update({
    where: { id: stopId },
    data: { barrelsPickedUp: { increment: barrelIds.length } },
  })

  return prisma.routeStop.findUnique({ where: { id: stopId }, include: { barrels: true } })
}

export async function novedadStop(
  routeId: string,
  stopId: string,
  description: string,
  userId: string,
  barrelId?: string
) {
  const route = await findRouteOrFail(routeId)
  if (!route.stops.find(s => s.id === stopId)) {
    throw new AppError('Parada no encontrada', 404, 'STOP_NOT_FOUND')
  }

  const [alert] = await Promise.all([
    prisma.alert.create({
      data: {
        type: 'NOVEDAD_EN_RUTA',
        message: description,
        severity: 'WARNING',
        barrelId: barrelId ?? null,
        routeId,
        routeStopId: stopId,
        targetRoles: ['ADMIN', 'SUPERVISOR'],
      },
    }),
    prisma.routeStop.update({ where: { id: stopId }, data: { status: StopStatus.CON_NOVEDAD } }),
    prisma.route.update({ where: { id: routeId }, data: { status: RouteStatus.CON_NOVEDAD } }),
  ])

  alertStream.broadcast(
    'novedad',
    { alertId: alert.id, routeId, stopId, description, severity: 'WARNING' },
    ['ADMIN', 'SUPERVISOR']
  )

  return alert
}

export async function cerrarRuta(id: string, userId: string) {
  const route = await findRouteOrFail(id)
  if (route.status !== RouteStatus.EN_CURSO && route.status !== RouteStatus.CON_NOVEDAD) {
    throw new AppError('La ruta no está en curso', 409, 'ROUTE_NOT_EN_CURSO')
  }
  return prisma.route.update({
    where: { id },
    data: { status: RouteStatus.COMPLETADA, arrivedAt: new Date() },
  })
}
