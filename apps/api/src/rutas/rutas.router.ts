import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { NovedadType, RouteStatus } from '@prisma/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import * as svc from './rutas.service'
import { auditLog } from '../middleware/auditLogger'

const router: Router = Router()

// ── GET /api/rutas ────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      status: z.nativeEnum(RouteStatus).optional(),
      date: z.string().optional(),
      transportistId: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const result = await svc.listRoutes(parsed.data)
    return res.json(result)
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/rutas ───────────────────────────────────────────────────────────
router.post('/', authenticate, authorize('SUPERVISOR', 'ADMIN'), auditLog('ROUTE_CREATED', 'route', () => 'new'), async (req: AuthRequest, res: Response) => {
  try {
    const requirementSchema = z.object({
      product: z.string().min(1, 'Producto requerido'),
      quantity: z.number().int().positive('Cantidad debe ser mayor a 0'),
    })
    const stopSchema = z.object({
      deliveryPointId: z.string(),
      position: z.number().int().positive(),
      requirements: z.array(requirementSchema).min(1, 'Cada parada necesita al menos un requerimiento'),
    })
    const schema = z.object({
      name: z.string().min(1),
      date: z.coerce.date(),
      transportistId: z.string(),
      vehiclePlate: z.string().optional(),
      stops: z.array(stopSchema).min(1),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const route = await svc.createRoute(parsed.data, req.user!.id)
    return res.status(201).json({ data: route })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── GET /api/rutas/:id ────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const route = await svc.getRoute(req.params['id'] as string)
    return res.json({ data: route })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/rutas/:id ──────────────────────────────────────────────────────
router.patch('/:id', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().optional(),
      date: z.coerce.date().optional(),
      vehiclePlate: z.string().optional(),
      transportistId: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const route = await svc.updateRoute(req.params['id'] as string, parsed.data)
    return res.json({ data: route })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/rutas/:id/iniciar ───────────────────────────────────────────────
// Called by bodega operator after scanning all barrels (barrelIds = scanned barrels)
router.post(
  '/:id/iniciar',
  authenticate,
  authorize('OPERARIO_BODEGA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        barrelIds: z.array(z.string()).min(1, 'Debe incluir al menos un barril'),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const route = await svc.iniciarRuta(req.params['id'] as string, parsed.data.barrelIds, req.user!.id)
      return res.json({ data: route })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── GET /api/rutas/:id/stops/:stopId ─────────────────────────────────────────
router.get('/:id/stops/:stopId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const stop = await svc.getStop(req.params['id'] as string, req.params['stopId'] as string)
    return res.json({ data: stop })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/rutas/:id/stops/:stopId/entregar ────────────────────────────────
router.post(
  '/:id/stops/:stopId/entregar',
  authenticate,
  authorize('TRANSPORTISTA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        barrelIds: z.array(z.string()).min(1),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const stop = await svc.entregarStop(
        req.params['id'] as string,
        req.params['stopId'] as string,
        parsed.data.barrelIds,
        req.user!.id,
        parsed.data.lat,
        parsed.data.lng
      )
      return res.json({ data: stop })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/rutas/:id/stops/:stopId/recoger ─────────────────────────────────
router.post(
  '/:id/stops/:stopId/recoger',
  authenticate,
  authorize('TRANSPORTISTA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        barrelIds: z.array(z.string()).min(1),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const stop = await svc.recogerStop(
        req.params['id'] as string,
        req.params['stopId'] as string,
        parsed.data.barrelIds,
        req.user!.id,
        parsed.data.lat,
        parsed.data.lng
      )
      return res.json({ data: stop })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/rutas/:id/stops/:stopId/completar ───────────────────────────────
router.post(
  '/:id/stops/:stopId/completar',
  authenticate,
  authorize('TRANSPORTISTA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const stop = await svc.completarStop(
        req.params['id'] as string,
        req.params['stopId'] as string,
        parsed.data.lat,
        parsed.data.lng
      )
      return res.json({ data: stop })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/rutas/:id/stops/:stopId/novedad ─────────────────────────────────
router.post(
  '/:id/stops/:stopId/novedad',
  authenticate,
  authorize('TRANSPORTISTA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        description: z.string().min(1, 'Descripción requerida'),
        barrelId: z.string().optional(),
        novedadType: z.nativeEnum(NovedadType).optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const alert = await svc.novedadStop(
        req.params['id'] as string,
        req.params['stopId'] as string,
        parsed.data.description,
        req.user!.id,
        parsed.data.barrelId,
        parsed.data.novedadType
      )
      return res.status(201).json({ data: alert })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/rutas/:id/cerrar ────────────────────────────────────────────────
router.post(
  '/:id/cerrar',
  authenticate,
  authorize('TRANSPORTISTA', 'SUPERVISOR', 'ADMIN'),
  auditLog('ROUTE_CERRADA', 'route', r => r.params['id'] as string),
  async (req: AuthRequest, res: Response) => {
    try {
      const route = await svc.cerrarRuta(req.params['id'] as string, req.user!.id)
      return res.json({ data: route })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

export { router as rutasRouter }
