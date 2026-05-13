import QRCode from 'qrcode'
import { BarrelStatus, EventType } from '@prisma/client'
import { prisma } from '../db/client'
import { AppError } from '../common/errors'
import { assertTransition } from '../services/barrelStateMachine'

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

  const [items, total] = await Promise.all([
    prisma.barrel.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.barrel.count({ where }),
  ])

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

async function executeTransition(
  id: string,
  toStatus: BarrelStatus,
  userId: string,
  extras: { routeId?: string; deliveryPointId?: string; lat?: number; lng?: number; notes?: string } = {}
) {
  const barrel = await findBarrelOrFail(id)
  const eventType = assertTransition(barrel.status, toStatus)

  const [updated] = await Promise.all([
    prisma.barrel.update({ where: { id }, data: { status: toStatus } }),
    createEvent(barrel.id, eventType, barrel.status, toStatus, userId, extras),
  ])

  return updated
}

export async function sendToMantenimiento(id: string, userId: string, notes?: string) {
  return executeTransition(id, BarrelStatus.EN_MANTENIMIENTO, userId, { notes })
}

export async function retornoMantenimiento(id: string, userId: string, notes?: string) {
  const barrel = await findBarrelOrFail(id)
  if (barrel.status !== BarrelStatus.EN_MANTENIMIENTO) {
    throw new AppError(`Transición inválida: ${barrel.status} → EN_BODEGA`, 400, 'INVALID_TRANSITION')
  }
  const [updated] = await Promise.all([
    prisma.barrel.update({
      where: { id },
      data: { status: BarrelStatus.EN_BODEGA, lastMaintenanceDate: new Date() },
    }),
    createEvent(barrel.id, EventType.RETORNO_MANTENIMIENTO, barrel.status, BarrelStatus.EN_BODEGA, userId, { notes }),
  ])
  return updated
}

export async function darDeBaja(id: string, userId: string, notes?: string) {
  return executeTransition(id, BarrelStatus.BAJA, userId, { notes })
}

export async function recibirBarril(id: string, userId: string, notes?: string) {
  // State machine enforces EN_RECOGIDA/DEVUELTO → EN_BODEGA; invalid states throw INVALID_TRANSITION
  return executeTransition(id, BarrelStatus.EN_BODEGA, userId, { notes })
}

export async function getBarrelQr(id: string) {
  const barrel = await findBarrelOrFail(id)
  const png = await QRCode.toBuffer(barrel.qrCode, { type: 'png', width: 300 })
  return {
    id: barrel.id,
    qrCode: barrel.qrCode,
    qrImage: `data:image/png;base64,${png.toString('base64')}`,
  }
}
