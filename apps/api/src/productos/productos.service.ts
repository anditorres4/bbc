import { prisma } from '../db/client'
import { AppError } from '../common/errors'

export async function listProducts(filters: { isActive?: boolean }) {
  return prisma.product.findMany({
    where: filters.isActive !== undefined ? { isActive: filters.isActive } : {},
    orderBy: { name: 'asc' },
  })
}

export async function createProduct(data: { name: string; defaultCapacity?: number }) {
  return prisma.product.create({ data })
}

export async function updateProduct(
  id: string,
  data: { name?: string; defaultCapacity?: number; isActive?: boolean }
) {
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) throw new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND')
  return prisma.product.update({ where: { id }, data })
}
