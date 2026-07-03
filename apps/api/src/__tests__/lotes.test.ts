import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../app'

jest.mock('../db/client', () => ({
  prisma: {
    product: { findUnique: jest.fn() },
    barrel: { findMany: jest.fn(), update: jest.fn() },
    productionBatch: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    barrelEvent: { create: jest.fn() },
    alert: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaSelf)),
  },
}))

const { prisma: prismaSelf } = require('../db/client')
const { prisma } = require('../db/client')

const JWT_SECRET = process.env.JWT_SECRET!
function makeToken(role: string, id = 'user-001') {
  return jwt.sign({ sub: id, role }, JWT_SECRET, { expiresIn: '1h' })
}
const produccionToken = makeToken('PRODUCCION', 'prod-001')

const PRODUCT = { id: 'prod-001', name: 'BBC IPA', defaultCapacity: 50, isActive: true, createdAt: new Date() }

function makeBarrel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'BBC-001',
    qrCode: 'QR-001',
    status: 'EN_BODEGA',
    product: null,
    currentBatchId: null,
    capacity: 50,
    ...overrides,
  }
}

describe('POST /api/lotes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-001' })
    ;(prisma.productionBatch.create as jest.Mock).mockResolvedValue({ id: 'batch-001', code: 'L-001' })
    ;(prisma.barrel.update as jest.Mock).mockResolvedValue({})
    ;(prisma.barrelEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-001' })
  })

  it('rechaza sin rol PRODUCCION/SUPERVISOR/ADMIN', async () => {
    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'x', role: 'TRANSPORTISTA' }, JWT_SECRET)}`)
      .send({ productId: 'prod-001', code: 'L-001', fillDate: new Date().toISOString(), barrelIds: ['BBC-001'] })

    expect(res.status).toBe(403)
  })

  it('crea un lote y actualiza los barriles seleccionados sin advertencias', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(PRODUCT)
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel()])
    ;(prisma.productionBatch.findFirst as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({
        productId: 'prod-001',
        code: 'L-001',
        fillDate: new Date().toISOString(),
        barrelIds: ['BBC-001'],
      })

    expect(res.status).toBe(201)
    expect(res.body.warnings).toEqual([])
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.barrel.update).toHaveBeenCalledWith({
      where: { id: 'BBC-001' },
      data: { product: 'BBC IPA', currentBatchId: 'batch-001' },
    })
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'LLENADO', product: 'BBC IPA', batchId: 'batch-001' }),
    })
  })

  it('advierte pero permite llenar un barril fuera de bodega', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(PRODUCT)
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel({ status: 'EN_TRANSPORTE' })])
    ;(prisma.productionBatch.findFirst as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({ productId: 'prod-001', code: 'L-002', fillDate: new Date().toISOString(), barrelIds: ['BBC-001'] })

    expect(res.status).toBe(201)
    expect(res.body.warnings[0]).toContain('fuera de bodega')
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.barrel.update).toHaveBeenCalledWith({
      where: { id: 'BBC-001' },
      data: { product: 'BBC IPA', currentBatchId: 'batch-001' },
    })
  })

  it('advierte pero permite un código de lote duplicado', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(PRODUCT)
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel()])
    ;(prisma.productionBatch.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'batch-old',
      code: 'L-001',
      createdAt: new Date('2026-01-01'),
    })

    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({ productId: 'prod-001', code: 'L-001', fillDate: new Date().toISOString(), barrelIds: ['BBC-001'] })

    expect(res.status).toBe(201)
    expect(res.body.warnings[0]).toContain('ya fue usado')
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.barrel.update).toHaveBeenCalledWith({
      where: { id: 'BBC-001' },
      data: { product: 'BBC IPA', currentBatchId: 'batch-001' },
    })
  })

  it('retorna 400 sin barriles seleccionados', async () => {
    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({ productId: 'prod-001', code: 'L-001', fillDate: new Date().toISOString(), barrelIds: [] })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/lotes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('filtra por mine=true usando el usuario autenticado', async () => {
    ;(prisma.productionBatch.findMany as jest.Mock).mockResolvedValueOnce([])

    const res = await request(app).get('/api/lotes?mine=true').set('Authorization', `Bearer ${produccionToken}`)

    expect(res.status).toBe(200)
    expect(prisma.productionBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdById: 'prod-001' } })
    )
  })

  it('filtra por mine=false sin restringir por usuario', async () => {
    ;(prisma.productionBatch.findMany as jest.Mock).mockResolvedValueOnce([])

    const res = await request(app).get('/api/lotes?mine=false').set('Authorization', `Bearer ${produccionToken}`)

    expect(res.status).toBe(200)
    expect(prisma.productionBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
  })
})
