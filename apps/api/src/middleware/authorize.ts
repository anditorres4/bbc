import type { Response, NextFunction } from 'express'
import { Role } from '@prisma/client'
import type { AuthRequest } from './authenticate'

/**
 * Uso: router.get('/ruta', authenticate, authorize(Role.ADMIN, Role.SUPERVISOR), handler)
 */
export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    if (!roles.includes(req.user.role as Role)) {
      res.status(403).json({ error: 'Acceso denegado', code: 'INSUFFICIENT_ROLE' })
      return
    }

    next()
  }
}
