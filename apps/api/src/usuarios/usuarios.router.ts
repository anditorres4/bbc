import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { Role } from '@prisma/client'
import { prisma } from '../db/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { AppError, handleError } from '../common/errors'

const router: Router = Router()

// All routes require ADMIN role
router.use(authenticate, authorize('ADMIN'))

const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
}

// ── GET /api/usuarios ─────────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      role: z.nativeEnum(Role).optional(),
      isActive: z.enum(['true', 'false']).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
    })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const { role, isActive, page, pageSize } = parsed.data
    const skip = (page - 1) * pageSize
    const where = {
      ...(role ? { role } : {}),
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, skip, take: pageSize, select: userSelect, orderBy: { name: 'asc' } }),
      prisma.user.count({ where }),
    ])

    return res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/usuarios ────────────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
      phone: z.string().optional(),
      role: z.nativeEnum(Role).default(Role.OPERARIO_BODEGA),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (existing) throw new AppError('El email ya está registrado', 409, 'EMAIL_TAKEN')

    const { password, ...rest } = parsed.data
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { ...rest, passwordHash }, select: userSelect })

    return res.status(201).json({ data: user })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── GET /api/usuarios/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const user = await prisma.user.findUnique({ where: { id }, select: userSelect })
    if (!user) throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND')
    return res.json({ data: user })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/usuarios/:id ───────────────────────────────────────────────────
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const schema = z.object({
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      role: z.nativeEnum(Role).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const user = await prisma.user.update({ where: { id }, data: parsed.data, select: userSelect })
    return res.json({ data: user })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── DELETE /api/usuarios/:id (deactivate) ─────────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    await prisma.user.update({ where: { id }, data: { isActive: false } })
    return res.status(204).send()
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/usuarios/:id/activate ─────────────────────────────────────────
router.patch('/:id/activate', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const user = await prisma.user.update({ where: { id }, data: { isActive: true }, select: userSelect })
    return res.json({ data: user })
  } catch (err) {
    return handleError(err, res)
  }
})

export { router as usuariosRouter }
