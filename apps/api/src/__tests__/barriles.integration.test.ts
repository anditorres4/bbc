import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../app'

// ── Mock Prisma completely ────────────────────────────────────────────────────
jest.mock('../db/client', () => ({
  prisma: {
    barrel: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    barrelEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    route: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    routeStop: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    routeStopBarrel: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    alert: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    deliveryPoint: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
const { prisma } = require('../db/client')

const JWT_SECRET = process.env.JWT_SECRET!

function makeToken(role: string, id = 'user-001') {
  return jwt.sign({ sub: id, role }, JWT_SECRET, { expiresIn: '1h' })
}

const adminToken = makeToken('ADMIN', 'admin-001')
const operarioToken = makeToken('OPERARIO_BODEGA', 'op-001')
const transportistaToken = makeToken('TRANSPORTISTA', 'trans-001')
const supervisorToken = makeToken('SUPERVISOR', 'sup-001')

// ── Fixtures ──────────────────────────────────────────────────────────────────
const QR_CODE = 'BBC-QR-001'
const BARREL_ID = 'BBC-001'
const ROUTE_ID = 'route-001'
const STOP_ID = 'stop-001'
const POINT_ID = 'point-001'

function makeBarrel(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: BARREL_ID,
    qrCode: QR_CODE,
    status,
    capacity: 30,
    manufactureDate: new Date('2020-01-01'),
    lastMaintenanceDate: null,
    maxLifeYears: 10,
    product: null,
    currentBatchId: null,
    notes: null,
    createdById: 'op-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    events: [],
    ...overrides,
  }
}

function makeRoute(status: string) {
  return {
    id: ROUTE_ID,
    name: 'Ruta Test',
    date: new Date(),
    status,
    transportistId: 'trans-001',
    vehiclePlate: 'ABC123',
    departedAt: null,
    arrivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    stops: [
      {
        id: STOP_ID,
        routeId: ROUTE_ID,
        deliveryPointId: POINT_ID,
        position: 1,
        status: 'PENDIENTE',
        barrelsAssigned: 1,
        barrelsDelivered: 0,
        barrelsPickedUp: 0,
        deliveredAt: null,
        lat: null,
        lng: null,
        deliveryPoint: { id: POINT_ID, name: 'Bar El Barril Feliz' },
        barrels: [{ id: 'rsb-001', routeStopId: STOP_ID, barrelId: BARREL_ID, product: 'Lager', status: 'ASIGNADO' }],
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FLUJO CRÍTICO: scan → alistamiento → iniciar → entregar → recoger → cerrar → recibir
// ─────────────────────────────────────────────────────────────────────────────

describe('Flujo crítico de barril', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetAllMocks()
    ;(prisma.barrelEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-001' })
    ;(prisma.routeStopBarrel.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.routeStopBarrel.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.routeStopBarrel.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-001', type: 'NOVEDAD_EN_RUTA' })
  })

  // ── Step 1: Scan crea el barril (no existe aún) ───────────────────────────
  it('1. POST /api/barriles/scan — crea barril nuevo en EN_BODEGA', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(null)
    ;(prisma.barrel.create as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))

    const res = await request(app)
      .post('/api/barriles/scan')
      .set('Authorization', `Bearer ${operarioToken}`)
      .send({ qrCode: QR_CODE })

    expect(res.status).toBe(201)
    expect(res.body.barrel.status).toBe('EN_BODEGA')
    expect(res.body.created).toBe(true)
    expect(prisma.barrel.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qrCode: QR_CODE, status: 'EN_BODEGA' }) })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'REGISTRO', toStatus: 'EN_BODEGA' }) })
    )
  })

  // ── Step 2: Segundo scan retorna el barril existente ─────────────────────
  it('2. POST /api/barriles/scan — retorna barril existente (sin crear)', async () => {
    const existing = makeBarrel('EN_BODEGA')
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(existing)

    const res = await request(app)
      .post('/api/barriles/scan')
      .set('Authorization', `Bearer ${operarioToken}`)
      .send({ qrCode: QR_CODE })

    expect(res.status).toBe(200)
    expect(res.body.created).toBe(false)
    expect(prisma.barrel.create).not.toHaveBeenCalled()
  })

  // ── Step 3: Crear ruta → barril pasa a EN_ALISTAMIENTO ───────────────────
  it('3. POST /api/rutas — crea ruta y transiciona barriles a EN_ALISTAMIENTO', async () => {
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_BODEGA')])
    ;(prisma.route.create as jest.Mock).mockResolvedValueOnce(makeRoute('PLANIFICADA'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_ALISTAMIENTO'))

    const res = await request(app)
      .post('/api/rutas')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        name: 'Ruta Test',
        date: new Date().toISOString(),
        transportistId: 'trans-001',
        stops: [{ deliveryPointId: POINT_ID, position: 1, barrels: [{ barrelId: BARREL_ID, product: 'Lager' }] }],
      })

    expect(res.status).toBe(201)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_ALISTAMIENTO' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ALISTAMIENTO', toStatus: 'EN_ALISTAMIENTO' }) })
    )
  })

  // ── Step 4: Iniciar ruta → barril pasa a EN_TRANSPORTE ───────────────────
  it('4. POST /api/rutas/:id/iniciar — transiciona barriles a EN_TRANSPORTE', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('PLANIFICADA'))
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_ALISTAMIENTO')])
    ;(prisma.route.update as jest.Mock).mockResolvedValueOnce({ ...makeRoute('EN_CURSO'), departedAt: new Date() })
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_TRANSPORTE'))
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/iniciar`)
      .set('Authorization', `Bearer ${transportistaToken}`)

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_TRANSPORTE' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SALIDA_BODEGA', toStatus: 'EN_TRANSPORTE' }) })
    )
  })

  // ── Step 5: Entregar stop → barril pasa a ENTREGADO ──────────────────────
  it('5. POST /api/rutas/:id/stops/:stopId/entregar — transiciona a ENTREGADO', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_TRANSPORTE')])
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('ENTREGADO'))
    ;(prisma.routeStop.update as jest.Mock).mockResolvedValueOnce({ id: STOP_ID, barrelsDelivered: 1, barrelsAssigned: 1 })
    ;(prisma.routeStop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: STOP_ID, barrelsDelivered: 1, barrelsAssigned: 1 })
      .mockResolvedValueOnce({ id: STOP_ID, status: 'COMPLETADA', barrels: [] })

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/stops/${STOP_ID}/entregar`)
      .set('Authorization', `Bearer ${transportistaToken}`)
      .send({ barrelIds: [BARREL_ID], lat: 4.6097, lng: -74.0817 })

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ENTREGADO' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ENTREGA_LLENO', toStatus: 'ENTREGADO' }) })
    )
  })

  // ── Step 6: Recoger vacío → barril pasa a EN_RECOGIDA ────────────────────
  it('6. POST /api/rutas/:id/stops/:stopId/recoger — transiciona a EN_RECOGIDA', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('ENTREGADO')])
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_RECOGIDA'))
    ;(prisma.routeStop.update as jest.Mock)
      .mockResolvedValueOnce({ id: STOP_ID })
      .mockResolvedValueOnce({ id: STOP_ID, barrels: [] })
    ;(prisma.routeStop.findUnique as jest.Mock).mockResolvedValueOnce({ id: STOP_ID, barrels: [] })

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/stops/${STOP_ID}/recoger`)
      .set('Authorization', `Bearer ${transportistaToken}`)
      .send({ barrelIds: [BARREL_ID] })

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_RECOGIDA' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RECOGIDA_VACIO', toStatus: 'EN_RECOGIDA' }) })
    )
  })

  // ── Step 7: Cerrar ruta → COMPLETADA ─────────────────────────────────────
  it('7. POST /api/rutas/:id/cerrar — cierra la ruta (COMPLETADA)', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))
    ;(prisma.route.update as jest.Mock).mockResolvedValueOnce({ ...makeRoute('COMPLETADA'), arrivedAt: new Date() })

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/cerrar`)
      .set('Authorization', `Bearer ${transportistaToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('COMPLETADA')
    expect(prisma.route.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETADA' }) })
    )
  })

  // ── Step 8: Recibir en bodega → barril vuelve a EN_BODEGA ─────────────────
  it('8. POST /api/barriles/:id/recibir — transiciona a EN_BODEGA', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_RECOGIDA'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))
    ;(prisma.routeStopBarrel.findFirst as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/recibir`)
      .set('Authorization', `Bearer ${operarioToken}`)
      .send({ notes: 'Barril recibido sin novedad' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('EN_BODEGA')
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_BODEGA', product: null, currentBatchId: null } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RETORNO_BODEGA', toStatus: 'EN_BODEGA' }) })
    )
  })

  // ── Step 9: Recibir un barril que traía producto — se limpia y queda trazado ──
  it('9. POST /api/barriles/:id/recibir — limpia product/currentBatchId y preserva trazabilidad en el evento', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(
      makeBarrel('EN_RECOGIDA', { product: 'BBC IPA', currentBatchId: 'batch-1' })
    )
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))
    ;(prisma.routeStopBarrel.findFirst as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/recibir`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_BODEGA', product: null, currentBatchId: null } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'RETORNO_BODEGA',
          toStatus: 'EN_BODEGA',
          product: 'BBC IPA',
          batchId: 'batch-1',
        }),
      })
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINA DE ESTADOS — transiciones inválidas
// ─────────────────────────────────────────────────────────────────────────────

describe('Máquina de estados — transiciones inválidas', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.barrelEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-001' })
    ;(prisma.barrel.update as jest.Mock).mockResolvedValue(makeBarrel('EN_BODEGA'))
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValue(makeBarrel('EN_BODEGA'))
    ;(prisma.routeStopBarrel.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.routeStopBarrel.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-001' })
  })

  it('permite recibir un barril EN_BODEGA (irregular) — advierte en vez de bloquear', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))
    ;(prisma.routeStopBarrel.findFirst as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/recibir`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(res.body.warning).toContain('irregular')
  })

  it('permite enviar a mantenimiento un barril en EN_TRANSPORTE (irregular) — advierte en vez de bloquear', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_TRANSPORTE'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_MANTENIMIENTO'))

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/mantenimiento`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(res.body.warning).toContain('irregular')
  })

  it('rechaza dar de baja sin rol ADMIN o SUPERVISOR', async () => {
    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/baja`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO BARRILES — casos adicionales
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/barriles', () => {
  it('requiere autenticación', async () => {
    const res = await request(app).get('/api/barriles')
    expect(res.status).toBe(401)
  })

  it('retorna lista paginada', async () => {
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_BODEGA')])
    ;(prisma.barrel.count as jest.Mock).mockResolvedValueOnce(1)

    const res = await request(app)
      .get('/api/barriles?page=1&pageSize=10')
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.total).toBe(1)
  })
})

describe('Mantenimiento', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.barrelEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-001' })
    ;(prisma.barrel.update as jest.Mock).mockResolvedValue(makeBarrel('EN_BODEGA'))
    ;(prisma.routeStopBarrel.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-001' })
  })

  it('POST /mantenimiento — EN_BODEGA → EN_MANTENIMIENTO', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_MANTENIMIENTO'))

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/mantenimiento`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_MANTENIMIENTO' } })
    )
  })

  it('POST /retorno-mantenimiento — EN_MANTENIMIENTO → EN_BODEGA', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_MANTENIMIENTO'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/retorno-mantenimiento`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EN_BODEGA', lastMaintenanceDate: expect.any(Date) }),
      })
    )
  })
})
