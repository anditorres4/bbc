import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { AppError, handleError } from '../common/errors'

const router: Router = Router()

// ── GET /api/puntos ───────────────────────────────────────────────────────────
router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const puntos = await prisma.deliveryPoint.findMany({ orderBy: { name: 'asc' } })
    return res.json({ data: puntos })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/puntos ──────────────────────────────────────────────────────────
router.post('/', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      address: z.string().min(1),
      lat: z.number().optional(),
      lng: z.number().optional(),
      phone: z.string().optional(),
      contactName: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const punto = await prisma.deliveryPoint.create({ data: parsed.data })
    return res.status(201).json({ data: punto })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── GET /api/puntos/:id ───────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const punto = await prisma.deliveryPoint.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { timestamp: 'desc' },
          take: 50,
          include: { barrel: { select: { id: true, qrCode: true } } },
        },
      },
    })
    if (!punto) throw new AppError('Punto de entrega no encontrado', 404, 'POINT_NOT_FOUND')
    return res.json({ data: punto })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/puntos/:id ─────────────────────────────────────────────────────
router.patch('/:id', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const schema = z.object({
      name: z.string().min(1).optional(),
      address: z.string().min(1).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      phone: z.string().optional(),
      contactName: z.string().optional(),
      isActive: z.boolean().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const punto = await prisma.deliveryPoint.update({ where: { id }, data: parsed.data })
    return res.json({ data: punto })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── DELETE /api/puntos/:id (deactivate) ───────────────────────────────────────
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    await prisma.deliveryPoint.update({ where: { id }, data: { isActive: false } })
    return res.status(204).send()
  } catch (err) {
    return handleError(err, res)
  }
})

export { router as puntosRouter }
