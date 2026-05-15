import { Router } from 'express'
import type { Response } from 'express'
import { BarrelStatus, Role, RouteStatus } from '@prisma/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import { prisma } from '../db/client'

const router: Router = Router()

// GET /api/reportes — pre-aggregated dashboard data for the reports page
router.get(
  '/',
  authenticate,
  authorize(Role.ADMIN, Role.SUPERVISOR),
  async (_req: AuthRequest, res: Response) => {
    try {
      // 1. Barrels by status
      const barrelStatuses = await prisma.barrel.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { _count: { status: 'desc' } },
      })
      const barrilesXEstado = barrelStatuses.map(r => ({
        status: r.status,
        count: r._count._all,
      }))

      // 2. Routes over the last 30 days grouped by date + status
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const recentRoutes = await prisma.route.findMany({
        where: { date: { gte: cutoff } },
        select: { date: true, status: true },
        orderBy: { date: 'asc' },
      })
      const routesByDay: Record<string, { total: number; completadas: number; canceladas: number; conNovedad: number }> = {}
      for (const r of recentRoutes) {
        const day = r.date.toISOString().split('T')[0]!
        if (!routesByDay[day]) routesByDay[day] = { total: 0, completadas: 0, canceladas: 0, conNovedad: 0 }
        routesByDay[day].total++
        if (r.status === RouteStatus.COMPLETADA) routesByDay[day].completadas++
        if (r.status === RouteStatus.CANCELADA) routesByDay[day].canceladas++
        if (r.status === RouteStatus.CON_NOVEDAD) routesByDay[day].conNovedad++
      }
      const rutasPorDia = Object.entries(routesByDay).map(([date, v]) => ({ date, ...v }))

      // 3. Top delivery points by deliveries
      const deliveryPoints = await prisma.deliveryPoint.findMany({
        include: {
          routeStops: {
            select: {
              barrelsDelivered: true,
              barrelsPickedUp: true,
              status: true,
            },
          },
        },
      })
      const topPuntosEntrega = deliveryPoints
        .map(dp => ({
          name: dp.name,
          address: dp.address,
          totalEntregas: dp.routeStops.reduce((n, s) => n + s.barrelsDelivered, 0),
          totalRecogidas: dp.routeStops.reduce((n, s) => n + s.barrelsPickedUp, 0),
          visitasCompletadas: dp.routeStops.filter(s => s.status === 'COMPLETADA').length,
        }))
        .sort((a, b) => b.totalEntregas - a.totalEntregas)

      // 4. Alerts summary by severity (last 30 days)
      const alertStats = await prisma.alert.groupBy({
        by: ['severity'],
        _count: { _all: true },
        where: { createdAt: { gte: cutoff } },
      })
      const alertasPorSeveridad = alertStats.map(r => ({
        severity: r.severity,
        count: r._count._all,
      }))

      // 5. Summary counters
      const [totalBarrels, activeRoutes, unreadAlerts] = await Promise.all([
        prisma.barrel.count(),
        prisma.route.count({ where: { status: { in: [RouteStatus.EN_CURSO, RouteStatus.CON_NOVEDAD] } } }),
        prisma.alert.count({ where: { isRead: false } }),
      ])

      // 6. Barrels by product (top 10)
      const productGroups = await prisma.barrel.groupBy({
        by: ['product'],
        _count: { _all: true },
        where: { product: { not: null } },
        orderBy: { _count: { product: 'desc' } },
        take: 10,
      })
      const barrilesXProducto = productGroups.map(r => ({
        product: r.product ?? 'Sin producto',
        count: r._count._all,
      }))

      // 7. Barrels not moving (status unchanged events in the last N days)
      const inactiveCutoff = new Date()
      inactiveCutoff.setDate(inactiveCutoff.getDate() - 60)
      const sinMovimiento60d = await prisma.barrel.count({
        where: {
          status: { notIn: [BarrelStatus.EN_BODEGA, BarrelStatus.BAJA] },
          events: { none: { timestamp: { gte: inactiveCutoff } } },
        },
      })

      return res.json({
        barrilesXEstado,
        barrilesXProducto,
        rutasPorDia,
        topPuntosEntrega,
        alertasPorSeveridad,
        summary: {
          totalBarrels,
          activeRoutes,
          unreadAlerts,
          sinMovimiento60d,
        },
      })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

export { router as reportesRouter }
