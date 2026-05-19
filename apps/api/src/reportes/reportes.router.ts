import { Router } from 'express'
import type { Request, Response } from 'express'
import { BarrelStatus, Role, RouteStatus } from '@prisma/client'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import { prisma } from '../db/client'

const router: Router = Router()

function parseDateRange(req: Request): { from: Date; to: Date } {
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(now.getDate() - 30)

  const from = req.query['from'] ? new Date(req.query['from'] as string) : defaultFrom
  const to = req.query['to'] ? new Date(req.query['to'] as string) : now
  // Set to end-of-day for "to"
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

// GET /api/reportes — pre-aggregated dashboard data
router.get(
  '/',
  authenticate,
  authorize(Role.ADMIN, Role.SUPERVISOR),
  async (req: AuthRequest, res: Response) => {
    try {
      const { from: cutoff, to: cutoffTo } = parseDateRange(req)

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

      // 2. Routes grouped by date + status in range
      const recentRoutes = await prisma.route.findMany({
        where: { date: { gte: cutoff, lte: cutoffTo } },
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

      // 4. Alerts summary by severity in range
      const alertStats = await prisma.alert.groupBy({
        by: ['severity'],
        _count: { _all: true },
        where: { createdAt: { gte: cutoff, lte: cutoffTo } },
      })
      const alertasPorSeveridad = alertStats.map(r => ({
        severity: r.severity,
        count: r._count._all,
      }))

      // 5. Summary counters
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const [totalBarrels, activeRoutes, unreadAlerts, totalDeliveriesHoy] = await Promise.all([
        prisma.barrel.count(),
        prisma.route.count({ where: { status: { in: [RouteStatus.EN_CURSO, RouteStatus.CON_NOVEDAD] } } }),
        prisma.alert.count({ where: { isRead: false } }),
        prisma.routeStopBarrel.count({
          where: { status: 'ENTREGADO', deliveredAt: { gte: todayStart, lte: todayEnd } },
        }),
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

      // 7. Barrels not moving 60d
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
          totalDeliveriesHoy,
        },
        dateRange: {
          from: cutoff.toISOString().split('T')[0],
          to: cutoffTo.toISOString().split('T')[0],
        },
      })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// GET /api/reportes/export?format=csv&from=&to= — CSV export
router.get(
  '/export',
  authenticate,
  authorize(Role.ADMIN, Role.SUPERVISOR),
  async (req: AuthRequest, res: Response) => {
    try {
      const { from: cutoff, to: cutoffTo } = parseDateRange(req)

      const [barrels, routes, alerts] = await Promise.all([
        prisma.barrel.findMany({
          select: {
            id: true,
            qrCode: true,
            status: true,
            product: true,
            capacity: true,
            manufactureDate: true,
            lastMaintenanceDate: true,
            maxLifeYears: true,
            createdAt: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.route.findMany({
          where: { date: { gte: cutoff, lte: cutoffTo } },
          select: {
            id: true,
            name: true,
            date: true,
            status: true,
            vehiclePlate: true,
            departedAt: true,
            arrivedAt: true,
            transportist: { select: { name: true } },
            stops: {
              select: {
                position: true,
                status: true,
                barrelsDelivered: true,
                barrelsPickedUp: true,
                deliveryPoint: { select: { name: true } },
              },
            },
          },
          orderBy: { date: 'desc' },
        }),
        prisma.alert.findMany({
          where: { createdAt: { gte: cutoff, lte: cutoffTo } },
          select: {
            type: true,
            severity: true,
            message: true,
            isRead: true,
            createdAt: true,
            barrel: { select: { id: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      function toCsv(headers: string[], rows: string[][]): string {
        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
        return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
      }

      const barrelsCsv = toCsv(
        ['ID', 'QR Code', 'Estado', 'Producto', 'Capacidad (L)', 'Fabricación', 'Último Mant.', 'Vida Máx. (años)', 'Registrado'],
        barrels.map(b => [
          b.id,
          b.qrCode,
          b.status,
          b.product ?? '',
          String(b.capacity),
          b.manufactureDate.toISOString().split('T')[0]!,
          b.lastMaintenanceDate?.toISOString().split('T')[0] ?? '',
          String(b.maxLifeYears),
          b.createdAt.toISOString().split('T')[0]!,
        ])
      )

      const routesCsv = toCsv(
        ['ID', 'Nombre', 'Fecha', 'Estado', 'Placa', 'Transportista', 'Salida', 'Llegada', 'Paradas', 'Barriles Entregados', 'Vacíos Recogidos'],
        routes.map(r => [
          r.id,
          r.name,
          r.date.toISOString().split('T')[0]!,
          r.status,
          r.vehiclePlate ?? '',
          r.transportist?.name ?? '',
          r.departedAt?.toISOString() ?? '',
          r.arrivedAt?.toISOString() ?? '',
          String(r.stops.length),
          String(r.stops.reduce((n, s) => n + s.barrelsDelivered, 0)),
          String(r.stops.reduce((n, s) => n + s.barrelsPickedUp, 0)),
        ])
      )

      const alertsCsv = toCsv(
        ['Tipo', 'Severidad', 'Mensaje', 'Barril', 'Leída', 'Fecha'],
        alerts.map(a => [
          a.type,
          a.severity,
          a.message,
          a.barrel?.id ?? '',
          a.isRead ? 'Sí' : 'No',
          a.createdAt.toISOString(),
        ])
      )

      const fromStr = cutoff.toISOString().split('T')[0]
      const toStr = cutoffTo.toISOString().split('T')[0]
      const combined = `BBC Barrel Track — Reporte ${fromStr} / ${toStr}\n\n=== BARRILES ===\n${barrelsCsv}\n\n=== RUTAS ===\n${routesCsv}\n\n=== ALERTAS ===\n${alertsCsv}\n`

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="bbc-reporte-${fromStr}-${toStr}.csv"`)
      return res.send('﻿' + combined)
    } catch (err) {
      return handleError(err, res)
    }
  }
)

export { router as reportesRouter }
