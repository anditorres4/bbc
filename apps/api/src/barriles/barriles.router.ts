import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { BarrelStatus } from '@prisma/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import * as svc from './barriles.service'

const router = Router()

// ── GET /api/barriles ─────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      status: z.nativeEnum(BarrelStatus).optional(),
      product: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const result = await svc.listBarrels(parsed.data)
    return res.json(result)
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/barriles/scan ───────────────────────────────────────────────────
router.post('/scan', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({ qrCode: z.string().min(1, 'qrCode requerido') })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const result = await svc.scanBarrel(parsed.data.qrCode, req.user!.id)
    return res.status(result.created ? 201 : 200).json(result)
  } catch (err) {
    return handleError(err, res)
  }
})

// ── GET /api/barriles/:id/qr ──────────────────────────────────────────────────
router.get('/:id/qr', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const result = await svc.getBarrelQr(id)
    return res.json(result)
  } catch (err) {
    return handleError(err, res)
  }
})

// ── GET /api/barriles/:id ─────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const barrel = await svc.getBarrel(id)
    return res.json({ data: barrel })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/barriles/:id ───────────────────────────────────────────────────
router.patch(
  '/:id',
  authenticate,
  authorize('OPERARIO_BODEGA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params['id'] as string
      const schema = z.object({
        capacity: z.number().int().positive().optional(),
        manufactureDate: z.coerce.date().optional(),
        lastMaintenanceDate: z.coerce.date().optional(),
        maxLifeYears: z.number().int().positive().optional(),
        product: z.string().optional(),
        notes: z.string().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const barrel = await svc.updateBarrel(id, parsed.data)
      return res.json({ data: barrel })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/barriles/:id/mantenimiento ──────────────────────────────────────
router.post(
  '/:id/mantenimiento',
  authenticate,
  authorize('OPERARIO_BODEGA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params['id'] as string
      const { notes } = req.body as { notes?: string }
      const barrel = await svc.sendToMantenimiento(id, req.user!.id, notes)
      return res.json({ data: barrel })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/barriles/:id/retorno-mantenimiento ──────────────────────────────
router.post(
  '/:id/retorno-mantenimiento',
  authenticate,
  authorize('OPERARIO_BODEGA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params['id'] as string
      const { notes } = req.body as { notes?: string }
      const barrel = await svc.retornoMantenimiento(id, req.user!.id, notes)
      return res.json({ data: barrel })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/barriles/:id/baja ───────────────────────────────────────────────
router.post(
  '/:id/baja',
  authenticate,
  authorize('SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params['id'] as string
      const { notes } = req.body as { notes?: string }
      const barrel = await svc.darDeBaja(id, req.user!.id, notes)
      return res.json({ data: barrel })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── POST /api/barriles/:id/recibir ────────────────────────────────────────────
router.post(
  '/:id/recibir',
  authenticate,
  authorize('OPERARIO_BODEGA', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params['id'] as string
      const { notes } = req.body as { notes?: string }
      const barrel = await svc.recibirBarril(id, req.user!.id, notes)
      return res.json({ data: barrel })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

export { router as barrilesRouter }
