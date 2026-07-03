import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import * as svc from './productos.service'

const router: Router = Router()

// ── GET /api/productos ──────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({ isActive: z.coerce.boolean().optional() })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const products = await svc.listProducts(parsed.data)
    return res.json({ data: products })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/productos ─────────────────────────────────────────────────────
router.post('/', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1, 'El nombre es requerido'),
      defaultCapacity: z.number().int().positive().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const product = await svc.createProduct(parsed.data)
    return res.status(201).json({ data: product })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/productos/:id ────────────────────────────────────────────────
router.patch('/:id', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const schema = z.object({
      name: z.string().min(1).optional(),
      defaultCapacity: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const product = await svc.updateProduct(id, parsed.data)
    return res.json({ data: product })
  } catch (err) {
    return handleError(err, res)
  }
})

export { router as productosRouter }
