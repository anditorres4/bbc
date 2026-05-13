import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { RouteStatus } from '@prisma/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import * as svc from './rutas.service'

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
router.post('/', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const barrelSchema = z.object({ barrelId: z.string(), product: z.string().min(1) })
    const stopSchema = z.object({
      deliveryPointId: z.string(),
      position: z.number().int().positive(),
      barrels: z.array(barrelSchema).min(1),
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
    const id = req.params['id'] as string
    const route = await svc.getRoute(id)
    return res.json({ data: route })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/rutas/:id ──────────────────────────────────────────────────────
router.patch('/:id', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const schema = z.object({
      name: z.string().optional(),
      date: z.coerce.date().optional(),
      vehiclePlate: z.string().optional(),
      transportistId: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const route = await svc.updateRoute(id, parsed.data)
    return res.json({ data: route })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/rutas/:id/iniciar ───────────────────────────────────────────────
router.post(
  '/:id/iniciar',
  authenticate,
  authorize('TRANSPORTISTA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params['id'] as string
      const route = await svc.iniciarRuta(id, req.user!.id)
      return res.json({ data: route })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/rutas/:id/stops/:stopId/entregar ────────────────────────────────
router.post(
  '/:id/stops/:stopId/entregar',
  authenticate,
  authorize('TRANSPORTISTA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params['id'] as string
      const stopId = req.params['stopId'] as string
      const schema = z.object({
        barrelIds: z.array(z.string()).min(1),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const stop = await svc.entregarStop(id, stopId, parsed.data.barrelIds, req.user!.id, parsed.data.lat, parsed.data.lng)
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
      const id = req.params['id'] as string
      const stopId = req.params['stopId'] as string
      const schema = z.object({
        barrelIds: z.array(z.string()).min(1),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const stop = await svc.recogerStop(id, stopId, parsed.data.barrelIds, req.user!.id, parsed.data.lat, parsed.data.lng)
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
      const id = req.params['id'] as string
      const stopId = req.params['stopId'] as string
      const schema = z.object({
        description: z.string().min(1, 'Descripción requerida'),
        barrelId: z.string().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const alert = await svc.novedadStop(id, stopId, parsed.data.description, req.user!.id, parsed.data.barrelId)
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
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params['id'] as string
      const route = await svc.cerrarRuta(id, req.user!.id)
      return res.json({ data: route })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

export { router as rutasRouter }
