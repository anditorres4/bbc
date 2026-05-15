import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import { prisma } from '../db/client'

const router: Router = Router()

// GET /api/auditoria
router.get(
  '/',
  authenticate,
  authorize(Role.ADMIN),
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        userId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(50),
      })
      const parsed = schema.safeParse(req.query)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const { entityType, entityId, userId, from, to, page, pageSize } = parsed.data
      const skip = (page - 1) * pageSize

      const where = {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(userId ? { userId } : {}),
        ...(from || to
          ? {
              timestamp: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
              },
            }
          : {}),
      }

      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { timestamp: 'desc' },
          include: { user: { select: { id: true, name: true, role: true } } },
        }),
        prisma.auditLog.count({ where }),
      ])

      return res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

export { router as auditoriaRouter }
