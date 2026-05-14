import cron from 'node-cron'
import { prisma } from '../db/client'
import { alertStream } from '../services/alertStream'

const DAYS_WITHOUT_MOVEMENT = 60
const MONTHS_MAINTENANCE_ALERT = 11
const DAYS_ROUTE_UNCLOSED = 1

async function checkInactiveBarrels() {
  const threshold = new Date(Date.now() - DAYS_WITHOUT_MOVEMENT * 86_400_000)

  // Find barrels whose last event is older than threshold
  const barrels = await prisma.barrel.findMany({
    where: {
      status: { notIn: ['BAJA'] },
      events: { none: { timestamp: { gte: threshold } } },
    },
    select: { id: true, qrCode: true },
  })

  for (const barrel of barrels) {
    const existing = await prisma.alert.findFirst({
      where: {
        barrelId: barrel.id,
        type: 'SIN_MOVIMIENTO_60_DIAS',
        isRead: false,
      },
    })
    if (existing) continue

    const alert = await prisma.alert.create({
      data: {
        type: 'SIN_MOVIMIENTO_60_DIAS',
        barrelId: barrel.id,
        message: `Barril ${barrel.id} (${barrel.qrCode}) sin movimiento por más de ${DAYS_WITHOUT_MOVEMENT} días`,
        severity: 'WARNING',
        targetRoles: ['ADMIN', 'SUPERVISOR'],
      },
    })

    alertStream.broadcast('alerta', alert, ['ADMIN', 'SUPERVISOR'])
  }
}

async function checkMaintenanceDue() {
  // Find barrels where last maintenance was 11+ months ago (due for maintenance soon)
  const threshold = new Date(Date.now() - MONTHS_MAINTENANCE_ALERT * 30 * 86_400_000)

  const barrels = await prisma.barrel.findMany({
    where: {
      status: { notIn: ['BAJA', 'EN_MANTENIMIENTO'] },
      lastMaintenanceDate: { lte: threshold },
    },
    select: { id: true, qrCode: true, lastMaintenanceDate: true },
  })

  for (const barrel of barrels) {
    const existing = await prisma.alert.findFirst({
      where: { barrelId: barrel.id, type: 'BARRIL_PROXIMO_MANTENIMIENTO', isRead: false },
    })
    if (existing) continue

    const alert = await prisma.alert.create({
      data: {
        type: 'BARRIL_PROXIMO_MANTENIMIENTO',
        barrelId: barrel.id,
        message: `Barril ${barrel.id} próximo a mantenimiento`,
        severity: 'INFO',
        targetRoles: ['ADMIN', 'SUPERVISOR', 'OPERARIO_BODEGA'],
      },
    })

    alertStream.broadcast('alerta', alert, ['ADMIN', 'SUPERVISOR'])
  }
}

async function checkLifespan() {
  const barrels = await prisma.barrel.findMany({
    where: { status: { notIn: ['BAJA'] } },
    select: { id: true, qrCode: true, manufactureDate: true, maxLifeYears: true },
  })

  const now = Date.now()
  for (const barrel of barrels) {
    const ageMs = now - barrel.manufactureDate.getTime()
    const ageYears = ageMs / (365.25 * 86_400_000)
    if (ageYears < barrel.maxLifeYears) continue

    const existing = await prisma.alert.findFirst({
      where: { barrelId: barrel.id, type: 'BARRIL_FIN_VIDA_UTIL', isRead: false },
    })
    if (existing) continue

    const alert = await prisma.alert.create({
      data: {
        type: 'BARRIL_FIN_VIDA_UTIL',
        barrelId: barrel.id,
        message: `Barril ${barrel.id} ha superado su vida útil de ${barrel.maxLifeYears} años`,
        severity: 'CRITICAL',
        targetRoles: ['ADMIN', 'SUPERVISOR'],
      },
    })

    alertStream.broadcast('alerta', alert, ['ADMIN', 'SUPERVISOR'])
  }
}

async function checkUnclosedRoutes() {
  const threshold = new Date(Date.now() - DAYS_ROUTE_UNCLOSED * 86_400_000)

  const routes = await prisma.route.findMany({
    where: { status: 'EN_CURSO', updatedAt: { lte: threshold } },
    select: { id: true, name: true },
  })

  for (const route of routes) {
    const existing = await prisma.alert.findFirst({
      where: { routeId: route.id, type: 'RUTA_SIN_CERRAR', isRead: false },
    })
    if (existing) continue

    const alert = await prisma.alert.create({
      data: {
        type: 'RUTA_SIN_CERRAR',
        routeId: route.id,
        message: `Ruta "${route.name}" lleva más de ${DAYS_ROUTE_UNCLOSED} día(s) sin cerrarse`,
        severity: 'WARNING',
        targetRoles: ['ADMIN', 'SUPERVISOR'],
      },
    })

    alertStream.broadcast('alerta', alert, ['ADMIN', 'SUPERVISOR'])
  }
}

export async function runDailyAlerts() {
  console.log('[jobs] Ejecutando alertas diarias...')
  await Promise.allSettled([
    checkInactiveBarrels(),
    checkMaintenanceDue(),
    checkLifespan(),
    checkUnclosedRoutes(),
  ])
  console.log('[jobs] Alertas diarias completadas')
}

export function scheduleDailyAlerts() {
  // Every day at 6:00 AM America/Bogota (UTC-5)
  cron.schedule('0 6 * * *', runDailyAlerts, { timezone: 'America/Bogota' })
  console.log('[jobs] Job de alertas diarias programado (06:00 America/Bogota)')
}
