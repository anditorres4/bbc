import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db/client'
import { AuthError } from './auth.types'

const ACCESS_EXPIRES = '15m'
const REFRESH_DAYS = 7

function jwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is not set')
  return s
}

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, jwtSecret(), { expiresIn: ACCESS_EXPIRES })
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !user.isActive) {
    throw new AuthError('Credenciales inválidas', 401)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw new AuthError('Credenciales inválidas', 401)
  }

  const accessToken = signAccessToken(user.id, user.role)
  const refreshToken = crypto.randomBytes(64).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 86_400_000)

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  })

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, role: user.role, email: user.email },
  }
}

export async function refresh(token: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { token } })

  if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
    throw new AuthError('Refresh token inválido o expirado', 401)
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } })
  if (!user || !user.isActive) {
    throw new AuthError('Usuario no encontrado o inactivo', 401)
  }

  return { accessToken: signAccessToken(user.id, user.role) }
}

export async function logout(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AuthError('Usuario no encontrado', 404)

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) throw new AuthError('Contraseña actual incorrecta', 400)

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

  // Revoke all active refresh tokens after password change (security)
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
