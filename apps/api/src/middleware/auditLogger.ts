import type { Response, NextFunction } from 'express'
import type { AuthRequest } from './authenticate'
import { prisma } from '../db/client'

export function auditLog(action: string, entityType: string, getEntityId: (req: AuthRequest) => string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res)

    res.json = function (body) {
      if (res.statusCode < 400 && req.user) {
        const entityId = getEntityId(req)
        prisma.auditLog
          .create({
            data: {
              userId: req.user.id,
              action,
              entityType,
              entityId,
              changes: req.body ? req.body : undefined,
              ip: req.ip ?? req.socket?.remoteAddress ?? null,
            },
          })
          .catch(() => {})
      }
      return originalJson(body)
    }

    next()
  }
}
