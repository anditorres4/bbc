import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import * as svc from './lotes.service'

const router: Router = Router()

// ── POST /api/lotes ─────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('PRODUCCION', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        productId: z.string().min(1),
        code: z.string().min(1, 'El código de lote es requerido'),
        fillDate: z.coerce.date(),
        barrelIds: z.array(z.string().min(1)).min(1, 'Debe seleccionar al menos un barril'),
        notes: z.string().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const result = await svc.createLote({ ...parsed.data, userId: req.user!.id })
      return res.status(201).json({ data: result.lote, warnings: result.warnings })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── GET /api/lotes ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({ mine: z.coerce.boolean().optional() })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const lotes = await svc.listLotes({ createdById: parsed.data.mine ? req.user!.id : undefined })
    return res.json({ data: lotes })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── GET /api/lotes/:id ──────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const lote = await svc.getLote(req.params['id'] as string)
    return res.json({ data: lote })
  } catch (err) {
    return handleError(err, res)
  }
})

export { router as lotesRouter }
