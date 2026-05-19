import { AlertSeverity, AlertType, BarrelStatus, BarrelStopStatus, EventType, NovedadType, Role, RouteStatus, StopStatus } from '@prisma/client'
import { prisma } from '../db/client'
import { AppError } from '../common/errors'
import { alertStream } from '../services/alertStream'

type RequirementInput = { product: string; quantity: number }
type StopInput = {
  deliveryPointId: string
  position: number
  requirements: RequirementInput[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Auto-cierra la ruta si todas sus paradas están en COMPLETADA o CON_NOVEDAD.
 * Si hay al menos una parada en PENDIENTE o CANCELADA la ruta no se cierra.
 */
async function checkAndCloseRoute(routeId: string) {
  const allStops = await prisma.routeStop.findMany({
    where: { routeId },
    select: { status: true },
  })
  const allDone = allStops.length > 0 && allStops.every(
    s => s.status === StopStatus.COMPLETADA || s.status === StopStatus.CON_NOVEDAD
  )
  if (allDone) {
    await prisma.route.update({
      where: { id: routeId },
      data: { status: RouteStatus.COMPLETADA, arrivedAt: new Date() },
    })
  }
}

async function findRouteOrFail(id: string) {
  const route = await prisma.route.findUnique({
    where: { id },
    include: {
      transportist: { select: { id: true, name: true } },
      stops: {
        include: {
          barrels: { include: { barrel: { select: { id: true, qrCode: true } } } },
          deliveryPoint: true,
          requirements: true,
          alerts: {
            where: { type: 'NOVEDAD_EN_RUTA' },
            orderBy: { createdAt: 'asc' },
            select: { id: true, message: true, createdAt: true, severity: true },
          },
        },
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
  _userId: string
) {
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
          barrelsAssigned: stop.requirements.reduce((sum, r) => sum + r.quantity, 0),
          requirements: {
            create: stop.requirements.map(r => ({ product: r.product, quantity: r.quantity })),
          },
        })),
      },
    },
    include: {
      stops: { include: { requirements: true }, orderBy: { position: 'asc' } },
    },
  })

  return route
}

export async function getRoute(id: string) {
  const route = await findRouteOrFail(id)
  const totalBarrels = route.stops.reduce((n, s) => n + s.barrelsAssigned, 0)
  const delivered = route.stops.reduce((n, s) => n + s.barrelsDelivered, 0)
  const pickedUp = route.stops.reduce((n, s) => n + s.barrelsPickedUp, 0)

  const stops = route.stops.map(s => ({
    ...s,
    totalBarrels: s.barrelsAssigned,
  }))

  return { ...route, stops, progress: { totalBarrels, delivered, pickedUp } }
}

export async function getStop(routeId: string, stopId: string) {
  const stop = await prisma.routeStop.findFirst({
    where: { id: stopId, routeId },
    include: {
      barrels: { include: { barrel: { select: { id: true, qrCode: true } } } },
      requirements: true,
      deliveryPoint: true,
    },
  })
  if (!stop) throw new AppError('Parada no encontrada', 404, 'STOP_NOT_FOUND')
  return { ...stop, totalBarrels: stop.barrelsAssigned }
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

export async function iniciarRuta(id: string, barrelIds: string[], userId: string) {
  const route = await findRouteOrFail(id)
  if (route.status !== RouteStatus.PLANIFICADA) {
    throw new AppError('La ruta ya fue iniciada o no está planificada', 409, 'ROUTE_NOT_PLANIFICADA')
  }
  if (barrelIds.length === 0) {
    throw new AppError('Debe escanear al menos un barril para iniciar la ruta', 400, 'NO_BARRELS')
  }

  // Validate all barrels exist and are EN_BODEGA
  const barrels = await prisma.barrel.findMany({ where: { id: { in: barrelIds } } })
  if (barrels.length !== barrelIds.length) {
    const found = new Set(barrels.map(b => b.id))
    const missing = barrelIds.filter(bid => !found.has(bid))
    throw new AppError(`Barriles no encontrados: ${missing.join(', ')}`, 404, 'BARREL_NOT_FOUND')
  }
  const notReady = barrels.filter(b => b.status !== BarrelStatus.EN_BODEGA)
  if (notReady.length > 0) {
    notReady.forEach(b => {
      prisma.alert.create({
        data: {
          type: AlertType.NOVEDAD_EN_RUTA,
          severity: AlertSeverity.WARNING,
          message: `Barril ${b.id} cargado en ruta ${id} con estado irregular: ${b.status}`,
          targetRoles: [Role.ADMIN, Role.SUPERVISOR],
          barrelId: b.id,
          routeId: id,
        },
      }).catch(err => console.error('[Alert] Error creando alerta de carga irregular:', err))
    })
  }

  // Validate all requirements are fulfilled
  const allReqs = route.stops.flatMap(s => s.requirements)
  const required: Record<string, number> = {}
  for (const req of allReqs) {
    required[req.product] = (required[req.product] ?? 0) + req.quantity
  }
  const scannedByProduct: Record<string, number> = {}
  for (const b of barrels) {
    if (b.product) {
      scannedByProduct[b.product] = (scannedByProduct[b.product] ?? 0) + 1
    }
  }
  for (const [product, qty] of Object.entries(required)) {
    const scanned = scannedByProduct[product] ?? 0
    if (scanned < qty) {
      throw new AppError(
        `Faltan ${qty - scanned} barril(es) de "${product}"`,
        400,
        'REQUIREMENTS_NOT_MET'
      )
    }
  }

  await Promise.all([
    prisma.route.update({ where: { id }, data: { status: RouteStatus.EN_CURSO, departedAt: new Date() } }),
    prisma.routeBarrel.createMany({
      data: barrelIds.map(barrelId => ({ routeId: id, barrelId })),
    }),
    ...barrels.map(b =>
      Promise.all([
        prisma.barrel.update({ where: { id: b.id }, data: { status: BarrelStatus.EN_TRANSPORTE } }),
        createBarrelEvent(b.id, EventType.SALIDA_BODEGA, b.status, BarrelStatus.EN_TRANSPORTE, userId, {
          routeId: id,
        }),
      ])
    ),
  ])

  return prisma.route.findUnique({
    where: { id },
    include: { stops: { include: { requirements: true }, orderBy: { position: 'asc' } } },
  })
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

  // Validate barrels are on the truck
  const routeBarrels = await prisma.routeBarrel.findMany({
    where: { routeId, barrelId: { in: barrelIds } },
  })
  if (routeBarrels.length !== barrelIds.length) {
    const found = new Set(routeBarrels.map(rb => rb.barrelId))
    const missing = barrelIds.filter(bid => !found.has(bid))
    throw new AppError(
      `Barriles no están en este camión: ${missing.join(', ')}`,
      400,
      'BARREL_NOT_ON_TRUCK'
    )
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

  // Validate product matches stop requirements and quantity not exceeded
  for (const barrel of barrels) {
    const req = stop.requirements.find(r => r.product === barrel.product)
    if (!req) {
      throw new AppError(
        `El producto "${barrel.product}" no está en los requerimientos de esta parada`,
        400,
        'PRODUCT_NOT_REQUIRED'
      )
    }
    const alreadyDelivered = await prisma.routeStopBarrel.count({
      where: {
        routeStopId: stopId,
        status: BarrelStopStatus.ENTREGADO,
        barrel: { product: barrel.product },
      },
    })
    if (alreadyDelivered >= req.quantity) {
      throw new AppError(
        `Ya se completó la cantidad requerida de "${barrel.product}" en esta parada`,
        400,
        'REQUIREMENT_FULFILLED'
      )
    }
  }

  const now = new Date()
  await Promise.all([
    ...barrels.map(b =>
      prisma.routeStopBarrel.create({
        data: {
          routeStopId: stopId,
          barrelId: b.id,
          product: b.product ?? '',
          status: BarrelStopStatus.ENTREGADO,
          deliveredAt: now,
        },
      })
    ),
    ...barrels.map(b =>
      Promise.all([
        prisma.barrel.update({ where: { id: b.id }, data: { status: BarrelStatus.ENTREGADO } }),
        createBarrelEvent(b.id, EventType.ENTREGA_LLENO, b.status, BarrelStatus.ENTREGADO, userId, {
          routeId,
          deliveryPointId: stop.deliveryPointId,
          lat,
          lng,
        }),
      ])
    ),
    prisma.routeStop.update({
      where: { id: stopId },
      data: { barrelsDelivered: { increment: barrelIds.length }, lat, lng, deliveredAt: now },
    }),
  ])

  // Mark stop COMPLETADA if all requirements met
  const updatedStop = await prisma.routeStop.findUnique({
    where: { id: stopId },
    include: { requirements: true },
  })
  if (updatedStop) {
    const totalRequired = updatedStop.requirements.reduce((sum, r) => sum + r.quantity, 0)
    if (updatedStop.barrelsDelivered >= totalRequired) {
      await prisma.routeStop.update({ where: { id: stopId }, data: { status: StopStatus.COMPLETADA } })
    }
  }

  // Auto-cierre de ruta si todas las paradas están terminadas
  await checkAndCloseRoute(routeId)

  return getStop(routeId, stopId)
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
  await Promise.all([
    ...barrels.map(b =>
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
    ),
    prisma.routeStop.update({
      where: { id: stopId },
      data: { barrelsPickedUp: { increment: barrelIds.length } },
    }),
  ])

  return getStop(routeId, stopId)
}

export async function completarStop(
  routeId: string,
  stopId: string,
  lat?: number,
  lng?: number
) {
  const route = await findRouteOrFail(routeId)
  if (route.status !== RouteStatus.EN_CURSO && route.status !== RouteStatus.CON_NOVEDAD) {
    throw new AppError('La ruta no está en curso', 409, 'ROUTE_NOT_EN_CURSO')
  }
  if (!route.stops.find(s => s.id === stopId)) {
    throw new AppError('Parada no encontrada', 404, 'STOP_NOT_FOUND')
  }
  await prisma.routeStop.update({
    where: { id: stopId },
    data: { status: StopStatus.COMPLETADA, lat, lng, deliveredAt: new Date() },
  })

  // Auto-cierre de ruta si todas las paradas están terminadas
  await checkAndCloseRoute(routeId)

  return getStop(routeId, stopId)
}

export async function novedadStop(
  routeId: string,
  stopId: string,
  description: string,
  userId: string,
  barrelId?: string,
  novedadType?: NovedadType
) {
  const route = await findRouteOrFail(routeId)
  const stop = route.stops.find(s => s.id === stopId)
  if (!stop) throw new AppError('Parada no encontrada', 404, 'STOP_NOT_FOUND')

  const message = novedadType ? `[${novedadType}] ${description}` : description

  const barrelEventData = barrelId
    ? prisma.barrel.findUnique({ where: { id: barrelId }, select: { status: true } }).then(b =>
        b ? prisma.barrelEvent.create({
          data: {
            barrelId,
            type: EventType.NOVEDAD,
            fromStatus: b.status,
            toStatus: b.status,
            userId,
            routeId,
            deliveryPointId: stop.deliveryPointId,
            notes: description,
            novedadType: novedadType ?? null,
          },
        }) : null
      )
    : Promise.resolve(null)

  const [alert] = await Promise.all([
    prisma.alert.create({
      data: {
        type: 'NOVEDAD_EN_RUTA',
        message,
        severity: 'WARNING',
        barrelId: barrelId ?? null,
        routeId,
        routeStopId: stopId,
        targetRoles: ['ADMIN', 'SUPERVISOR'],
      },
    }),
    barrelEventData,
    prisma.routeStop.update({ where: { id: stopId }, data: { status: StopStatus.CON_NOVEDAD } }),
    prisma.route.update({ where: { id: routeId }, data: { status: RouteStatus.CON_NOVEDAD } }),
  ])

  alertStream.broadcast(
    'novedad',
    { alertId: alert.id, routeId, stopId, description, novedadType, severity: 'WARNING' },
    ['ADMIN', 'SUPERVISOR']
  )

  // Auto-cierre de ruta si todas las paradas están terminadas (incluyendo la recién marcada CON_NOVEDAD)
  await checkAndCloseRoute(routeId)

  return alert
}

export async function markStopUndeliverable(
  routeId: string,
  stopId: string,
  _userId: string,
  novedadType?: NovedadType,
  comentario?: string
) {
  const route = await findRouteOrFail(routeId)
  if (route.status !== RouteStatus.EN_CURSO && route.status !== RouteStatus.CON_NOVEDAD) {
    throw new AppError('La ruta no está en curso', 409, 'ROUTE_NOT_EN_CURSO')
  }
  const stop = route.stops.find(s => s.id === stopId)
  if (!stop) throw new AppError('Parada no encontrada', 404, 'STOP_NOT_FOUND')

  const parts: string[] = []
  if (novedadType) parts.push(`[${novedadType}]`)
  parts.push('No entregable')
  if (comentario?.trim()) parts.push(`— ${comentario.trim()}`)
  const message = parts.join(' ')

  const [alert] = await Promise.all([
    prisma.alert.create({
      data: {
        type: 'NOVEDAD_EN_RUTA',
        message,
        severity: 'WARNING',
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
    { alertId: alert.id, routeId, stopId, novedadType, severity: 'WARNING', undeliverable: true },
    ['ADMIN', 'SUPERVISOR']
  )

  return alert
}

export async function cerrarRuta(id: string, _userId: string) {
  const route = await findRouteOrFail(id)
  if (route.status !== RouteStatus.EN_CURSO && route.status !== RouteStatus.CON_NOVEDAD) {
    throw new AppError('La ruta no está en curso', 409, 'ROUTE_NOT_EN_CURSO')
  }
  return prisma.route.update({
    where: { id },
    data: { status: RouteStatus.COMPLETADA, arrivedAt: new Date() },
  })
}
