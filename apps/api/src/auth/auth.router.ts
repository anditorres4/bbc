import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { login, refresh, logout, changePassword } from './auth.service'
import { AuthError } from './auth.types'
import { authenticate } from '../middleware/authenticate'
import type { AuthRequest } from '../middleware/authenticate'

const router: Router = Router()

const REFRESH_COOKIE = 'bbc_refresh'

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
  path: '/',
}

function handleError(err: unknown, res: Response): Response {
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message })
  }
  console.error('[auth]', err)
  return res.status(500).json({ error: 'Error interno del servidor' })
}

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Contraseña requerida'),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' })
  }

  try {
    const result = await login(parsed.data.email, parsed.data.password)
    // Refresh token en httpOnly cookie para web; también en el body para móvil
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions)
    return res.json(result)
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /auth/refresh ────────────────────────────────────────────────────────
// Acepta refresh token desde cookie (web) o body (móvil)
router.post('/refresh', async (req: Request, res: Response) => {
  const token =
    (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE] ??
    (req.body as Record<string, unknown>)?.refreshToken

  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Refresh token requerido' })
  }

  try {
    const result = await refresh(token)
    return res.json(result)
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', async (req: Request, res: Response) => {
  const token =
    (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE] ??
    (req.body as Record<string, unknown>)?.refreshToken

  if (token && typeof token === 'string') {
    await logout(token).catch(() => {}) // best-effort: no falla si el token ya era inválido
  }

  res.clearCookie(REFRESH_COOKIE)
  return res.status(204).send()
})

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, phone: true, isActive: true },
  })

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  return res.json({ data: user })
})

// ── POST /auth/change-password ────────────────────────────────────────────────
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    currentPassword: z.string().min(1, 'Contraseña actual requerida'),
    newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' })
  }

  try {
    await changePassword(req.user!.id, parsed.data.currentPassword, parsed.data.newPassword)
    return res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (err) {
    return handleError(err, res)
  }
})

export { router as authRouter }
