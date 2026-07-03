import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../app'

jest.mock('../db/client', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const { prisma } = require('../db/client')

const JWT_SECRET = process.env.JWT_SECRET!
function makeToken(role: string, id = 'user-001') {
  return jwt.sign({ sub: id, role }, JWT_SECRET, { expiresIn: '1h' })
}
const adminToken = makeToken('ADMIN', 'admin-001')
const supervisorToken = makeToken('SUPERVISOR', 'sup-001')
const produccionToken = makeToken('PRODUCCION', 'prod-001')

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-001',
    name: 'BBC IPA',
    defaultCapacity: 50,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('GET /api/productos', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requiere autenticación', async () => {
    const res = await request(app).get('/api/productos')
    expect(res.status).toBe(401)
  })

  it('retorna todos los productos sin filtro', async () => {
    ;(prisma.product.findMany as jest.Mock).mockResolvedValueOnce([makeProduct(), makeProduct({ isActive: false })])

    const res = await request(app).get('/api/productos').set('Authorization', `Bearer ${produccionToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
  })

  it('filtra por isActive=true cuando se pide', async () => {
    ;(prisma.product.findMany as jest.Mock).mockResolvedValueOnce([makeProduct()])

    const res = await request(app)
      .get('/api/productos?isActive=true')
      .set('Authorization', `Bearer ${produccionToken}`)

    expect(res.status).toBe(200)
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }))
  })
})

describe('POST /api/productos', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rechaza sin rol SUPERVISOR/ADMIN', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({ name: 'Nueva IPA' })

    expect(res.status).toBe(403)
  })

  it('crea un producto con rol ADMIN', async () => {
    ;(prisma.product.create as jest.Mock).mockResolvedValueOnce(makeProduct({ name: 'Nueva IPA' }))

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nueva IPA', defaultCapacity: 50 })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Nueva IPA')
  })

  it('rechaza sin nombre', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/productos/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('desactiva un producto con rol SUPERVISOR', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(makeProduct())
    ;(prisma.product.update as jest.Mock).mockResolvedValueOnce(makeProduct({ isActive: false }))

    const res = await request(app)
      .patch('/api/productos/prod-001')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(false)
  })

  it('retorna 404 si el producto no existe', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .patch('/api/productos/no-existe')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })

    expect(res.status).toBe(404)
  })
})
