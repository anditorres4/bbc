import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
  id: string
  role: string
}

// Extiende el tipo Request de Express para exponer req.user en las rutas protegidas
export interface AuthRequest extends Request {
  user?: AuthPayload
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de acceso requerido' })
    return
  }

  const token = header.slice(7)
  const secret = process.env.JWT_SECRET

  if (!secret) {
    res.status(500).json({ error: 'Configuración de servidor inválida' })
    return
  }

  try {
    const payload = jwt.verify(token, secret) as { sub: string; role: string }
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' })
      return
    }
    res.status(401).json({ error: 'Token inválido', code: 'INVALID_TOKEN' })
  }
}
