import { BarrelStatus, EventType } from '@prisma/client'
import { prisma } from '../db/client'
import { AppError } from '../common/errors'
import { fireIrregularAlert } from '../barriles/barriles.service'

type CreateLoteInput = {
  productId: string
  code: string
  fillDate: Date
  barrelIds: string[]
  notes?: string
  userId: string
}

export async function createLote(input: CreateLoteInput) {
  const { productId, code, fillDate, notes, userId } = input
  const barrelIds = [...new Set(input.barrelIds)]

  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND')

  const barrels = await prisma.barrel.findMany({ where: { id: { in: barrelIds } } })
  if (barrels.length !== barrelIds.length) {
    const found = new Set(barrels.map(b => b.id))
    const missing = barrelIds.filter(id => !found.has(id))
    throw new AppError(`Barriles no encontrados: ${missing.join(', ')}`, 404, 'BARREL_NOT_FOUND')
  }

  const warnings: string[] = []

  const duplicateCode = await prisma.productionBatch.findFirst({
    where: { code: { equals: code, mode: 'insensitive' } },
  })
  if (duplicateCode) {
    const msg = `Código de lote "${code}" ya fue usado el ${duplicateCode.createdAt.toLocaleDateString('es-CO')}`
    warnings.push(msg)
    fireIrregularAlert(msg)
  }

  for (const barrel of barrels) {
    if (barrel.status !== BarrelStatus.EN_BODEGA) {
      const msg = `Barril ${barrel.id} llenado fuera de bodega (estado: ${barrel.status})`
      warnings.push(msg)
      fireIrregularAlert(msg, barrel.id)
    }
    if (barrel.product) {
      const msg = `Barril ${barrel.id} ya tenía producto "${barrel.product}" — reemplazado por "${product.name}"`
      warnings.push(msg)
      fireIrregularAlert(msg, barrel.id)
    }
  }

  const lote = await prisma.$transaction(async tx => {
    const created = await tx.productionBatch.create({
      data: { code, productId, fillDate, notes, createdById: userId },
    })

    for (const barrel of barrels) {
      await tx.barrel.update({
        where: { id: barrel.id },
        data: { product: product.name, currentBatchId: created.id },
      })
      await tx.barrelEvent.create({
        data: {
          barrelId: barrel.id,
          type: EventType.LLENADO,
          fromStatus: barrel.status,
          toStatus: barrel.status,
          userId,
          product: product.name,
          batchId: created.id,
        },
      })
    }

    return created
  })

  return { lote, warnings }
}

export async function listLotes(filters: { createdById?: string }) {
  return prisma.productionBatch.findMany({
    where: filters.createdById ? { createdById: filters.createdById } : {},
    include: {
      product: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      barrels: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function getLote(id: string) {
  const lote = await prisma.productionBatch.findUnique({
    where: { id },
    include: {
      product: true,
      createdBy: { select: { id: true, name: true } },
      barrels: { select: { id: true, qrCode: true, status: true } },
    },
  })
  if (!lote) throw new AppError('Lote no encontrado', 404, 'BATCH_NOT_FOUND')
  return lote
}
