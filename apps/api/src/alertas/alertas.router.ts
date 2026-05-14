import { Router } from 'express'
import type { Response, NextFunction } from 'express'
import { z } from 'zod'
import { AlertType, AlertSeverity, Role } from '@prisma/client'
import { prisma } from '../db/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { AppError, handleError } from '../common/errors'
import { alertStream } from '../services/alertStream'

const router: Router = Router()

// ── GET /api/alertas/stream (SSE) ─────────────────────────────────────────────
// EventSource cannot set custom headers, so we accept the token via ?token=
router.get(
  '/stream',
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    const qToken = req.query['token'] as string | undefined
    if (qToken && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${qToken}`
    }
    next()
  },
  authenticate,
  (req: AuthRequest, res: Response) => {
    alertStream.addClient(req.user!.id, [req.user!.role], res)
  }
)

// ── GET /api/alertas ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      type: z.nativeEnum(AlertType).optional(),
      severity: z.nativeEnum(AlertSeverity).optional(),
      isRead: z.enum(['true', 'false']).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const { type, severity, isRead, page, pageSize } = parsed.data
    const skip = (page - 1) * pageSize

    const where = {
      targetRoles: { has: req.user!.role as Role },
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
      ...(isRead !== undefined ? { isRead: isRead === 'true' } : {}),
    }

    const [items, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          barrel: { select: { id: true, qrCode: true } },
          route: { select: { id: true, name: true } },
        },
      }),
      prisma.alert.count({ where }),
    ])

    return res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/alertas/leer-todas ──────────────────────────────────────────────
router.post('/leer-todas', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.alert.updateMany({
      where: {
        targetRoles: { has: req.user!.role as Role },
        isRead: false,
      },
      data: { isRead: true, readById: req.user!.id, readAt: new Date() },
    })
    return res.json({ success: true })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/alertas/:id/leer ───────────────────────────────────────────────
router.patch('/:id/leer', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const alert = await prisma.alert.findUnique({ where: { id } })
    if (!alert) throw new AppError('Alerta no encontrada', 404, 'ALERT_NOT_FOUND')

    const updated = await prisma.alert.update({
      where: { id },
      data: { isRead: true, readById: req.user!.id, readAt: new Date() },
    })
    return res.json({ data: updated })
  } catch (err) {
    return handleError(err, res)
  }
})

export { router as alertasRouter }
