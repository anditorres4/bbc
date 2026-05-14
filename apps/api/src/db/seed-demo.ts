import 'dotenv/config'
import {
  PrismaClient,
  Role,
  BarrelStatus,
  EventType,
  AlertType,
  AlertSeverity,
} from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const PASSWORD = 'BBC2026!'

async function main() {
  console.log('Seeding BBC Barrel Track — DEMO\n')

  const hash = await bcrypt.hash(PASSWORD, 12)

  // ── Users ──────────────────────────────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: { email: 'admin@bbc.com' },
    update: {},
    create: { email: 'admin@bbc.com', passwordHash: hash, name: 'Admin Sistema', role: Role.ADMIN },
  })
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@bbc.com' },
    update: {},
    create: { email: 'supervisor@bbc.com', passwordHash: hash, name: 'Carlos Supervisor', role: Role.SUPERVISOR },
  })
  await prisma.user.upsert({
    where: { email: 'bodega1@bbc.com' },
    update: {},
    create: { email: 'bodega1@bbc.com', passwordHash: hash, name: 'Maria Bodega', role: Role.OPERARIO_BODEGA },
  })
  await prisma.user.upsert({
    where: { email: 'bodega2@bbc.com' },
    update: {},
    create: { email: 'bodega2@bbc.com', passwordHash: hash, name: 'Juan Bodega', role: Role.OPERARIO_BODEGA },
  })
  const trans1 = await prisma.user.upsert({
    where: { email: 'trans1@bbc.com' },
    update: {},
    create: { email: 'trans1@bbc.com', passwordHash: hash, name: 'Pedro Trans', role: Role.TRANSPORTISTA },
  })
  await prisma.user.upsert({
    where: { email: 'trans2@bbc.com' },
    update: {},
    create: { email: 'trans2@bbc.com', passwordHash: hash, name: 'Luis Trans', role: Role.TRANSPORTISTA },
  })
  await prisma.user.upsert({
    where: { email: 'trans3@bbc.com' },
    update: {},
    create: { email: 'trans3@bbc.com', passwordHash: hash, name: 'Ana Trans', role: Role.TRANSPORTISTA },
  })
  console.log('Users created (admin, supervisor, bodega1/2, trans1/2/3)')

  // ── Delivery points ────────────────────────────────────────────────────────

  const dp1 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_el_sabor' },
    update: {},
    create: {
      id: 'dp_el_sabor',
      name: 'Restaurante El Sabor',
      address: 'Chapinero, Bogota',
      lat: 4.6488,
      lng: -74.0544,
      contactName: 'Chef Rodriguez',
    },
  })
  const dp2 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_la_esquina' },
    update: {},
    create: {
      id: 'dp_la_esquina',
      name: 'Bar La Esquina',
      address: 'Usaquen, Bogota',
      lat: 4.6941,
      lng: -74.0317,
      contactName: 'Jorge Bar',
    },
  })
  const dp3 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_club_norte' },
    update: {},
    create: {
      id: 'dp_club_norte',
      name: 'Club Social Norte',
      address: 'Suba, Bogota',
      lat: 4.7408,
      lng: -74.0849,
      contactName: 'Recepcion',
    },
  })
  await prisma.deliveryPoint.upsert({
    where: { id: 'dp_don_pedro' },
    update: {},
    create: {
      id: 'dp_don_pedro',
      name: 'Tienda Don Pedro',
      address: 'La Candelaria, Bogota',
      lat: 4.5981,
      lng: -74.0762,
      contactName: 'Don Pedro',
    },
  })
  await prisma.deliveryPoint.upsert({
    where: { id: 'dp_hotel_plaza' },
    update: {},
    create: {
      id: 'dp_hotel_plaza',
      name: 'Hotel Plaza',
      address: 'Centro, Bogota',
      lat: 4.6097,
      lng: -74.0817,
      contactName: 'Cocteleria',
    },
  })
  console.log('Delivery points created (5 Bogota locations)')

  // ── Cleanup existing transactional data ───────────────────────────────────
  await prisma.alert.deleteMany({})
  await prisma.barrelEvent.deleteMany({})
  await prisma.routeStopBarrel.deleteMany({})
  await prisma.routeStopRequirement.deleteMany({})
  await prisma.routeBarrel.deleteMany({})
  await prisma.routeStop.deleteMany({})
  await prisma.route.deleteMany({})
  await prisma.barrel.deleteMany({})
  console.log('Existing data cleared')

  // ── Barrels ────────────────────────────────────────────────────────────────
  // Reset sequence so IDs are BBC-001 to BBC-020 in insertion order.

  await prisma.$executeRaw`ALTER SEQUENCE barrel_id_seq RESTART WITH 1`

  type BarrelInput = {
    qrCode: string
    status: BarrelStatus
    capacity: number
    manufactureDate: Date
    lastMaintenanceDate?: Date
    product: string
    notes?: string
  }

  async function createBarrel(input: BarrelInput) {
    return prisma.barrel.create({
      data: {
        qrCode: input.qrCode,
        status: input.status,
        capacity: input.capacity,
        manufactureDate: input.manufactureDate,
        lastMaintenanceDate: input.lastMaintenanceDate,
        product: input.product,
        notes: input.notes,
        createdById: admin.id,
      },
    })
  }

  const barrels = []

  // BBC-001 to BBC-010 — Monserrate Negra 50L
  for (let i = 1; i <= 10; i++) {
    barrels.push(
      await createBarrel({
        qrCode: `BBC-${String(i).padStart(3, '0')}`,
        status: BarrelStatus.EN_BODEGA,
        capacity: 50,
        manufactureDate: new Date('2020-06-01'),
        product: 'Monserrate Negra',
      }),
    )
  }

  // BBC-011 to BBC-015 — Monserrate Roja 30L
  for (let i = 11; i <= 15; i++) {
    barrels.push(
      await createBarrel({
        qrCode: `BBC-${String(i).padStart(3, '0')}`,
        status: BarrelStatus.EN_BODEGA,
        capacity: 30,
        manufactureDate: new Date('2022-03-15'),
        product: 'Monserrate Roja',
      }),
    )
  }

  // BBC-016 — EN_MANTENIMIENTO (last service Jan 2025, currently in shop)
  barrels.push(
    await createBarrel({
      qrCode: 'BBC-016',
      status: BarrelStatus.EN_MANTENIMIENTO,
      capacity: 50,
      manufactureDate: new Date('2020-06-01'),
      lastMaintenanceDate: new Date('2025-01-01'),
      product: 'Monserrate Negra',
    }),
  )

  // BBC-017 — 357 days since last maintenance → triggers BARRIL_PROXIMO_MANTENIMIENTO
  barrels.push(
    await createBarrel({
      qrCode: 'BBC-017',
      status: BarrelStatus.EN_BODEGA,
      capacity: 50,
      manufactureDate: new Date('2020-06-01'),
      lastMaintenanceDate: new Date('2025-05-20'),
      product: 'Monserrate Negra',
    }),
  )

  // BBC-018 — manufacture 2016-01-01, maxLife 10y → expired 2026-01-01
  barrels.push(
    await createBarrel({
      qrCode: 'BBC-018',
      status: BarrelStatus.EN_BODEGA,
      capacity: 30,
      manufactureDate: new Date('2016-01-01'),
      product: 'Monserrate Roja',
    }),
  )

  // BBC-019 — manufacture 2015-06-01 → expired 2025-06-01, nearly a year over life
  barrels.push(
    await createBarrel({
      qrCode: 'BBC-019',
      status: BarrelStatus.EN_BODEGA,
      capacity: 50,
      manufactureDate: new Date('2015-06-01'),
      product: 'Monserrate Negra',
    }),
  )

  // BBC-020 — BAJA
  barrels.push(
    await createBarrel({
      qrCode: 'BBC-020',
      status: BarrelStatus.BAJA,
      capacity: 50,
      manufactureDate: new Date('2015-01-01'),
      product: 'Monserrate Negra',
      notes: 'Vida util completada - Mayo 2025',
    }),
  )

  const ids = barrels.map(b => b.id)
  console.log(`Barrels created: ${ids.join(', ')}`)

  // Verify IDs match expected BBC-001..BBC-020 format
  for (let i = 0; i < ids.length; i++) {
    const expected = `BBC-${String(i + 1).padStart(3, '0')}`
    if (ids[i] !== expected) {
      throw new Error(`Barrel ID mismatch: expected ${expected}, got ${ids[i]}. Reset the sequence and retry.`)
    }
  }

  // ── Barrel events ──────────────────────────────────────────────────────────

  for (const barrel of barrels) {
    await prisma.barrelEvent.create({
      data: {
        barrelId: barrel.id,
        type: EventType.REGISTRO,
        fromStatus: null,
        toStatus: BarrelStatus.EN_BODEGA,
        userId: admin.id,
        notes: 'Registro inicial de barril',
      },
    })

    if (barrel.status === BarrelStatus.EN_MANTENIMIENTO) {
      await prisma.barrelEvent.create({
        data: {
          barrelId: barrel.id,
          type: EventType.ENVIO_MANTENIMIENTO,
          fromStatus: BarrelStatus.EN_BODEGA,
          toStatus: BarrelStatus.EN_MANTENIMIENTO,
          userId: admin.id,
          notes: 'Enviado a mantenimiento programado',
        },
      })
    } else if (barrel.status === BarrelStatus.BAJA) {
      await prisma.barrelEvent.create({
        data: {
          barrelId: barrel.id,
          type: EventType.DISPOSICION_FINAL,
          fromStatus: BarrelStatus.EN_BODEGA,
          toStatus: BarrelStatus.BAJA,
          userId: admin.id,
          notes: barrel.notes ?? 'Barril dado de baja',
        },
      })
    }
  }
  console.log('Barrel events created')

  // ── Demo route ─────────────────────────────────────────────────────────────

  const today = new Date()
  today.setHours(8, 0, 0, 0)

  const route = await prisma.route.create({
    data: {
      name: 'Ruta Norte - Demo',
      date: today,
      status: 'PLANIFICADA',
      transportistId: trans1.id,
      vehiclePlate: 'ABC-123',
      stops: {
        create: [
          {
            deliveryPointId: dp1.id,
            position: 1,
            barrelsAssigned: 3,
            requirements: {
              create: [{ product: 'Monserrate Negra', quantity: 3 }],
            },
          },
          {
            deliveryPointId: dp2.id,
            position: 2,
            barrelsAssigned: 2,
            requirements: {
              create: [{ product: 'Monserrate Roja', quantity: 2 }],
            },
          },
          {
            deliveryPointId: dp3.id,
            position: 3,
            barrelsAssigned: 2,
            requirements: {
              create: [{ product: 'Monserrate Negra', quantity: 2 }],
            },
          },
        ],
      },
    },
  })
  console.log(`Demo route created: "${route.name}" for ${today.toLocaleDateString('es-CO')}`)

  // ── Pre-existing alerts ────────────────────────────────────────────────────

  await prisma.alert.create({
    data: {
      type: AlertType.SIN_MOVIMIENTO_60_DIAS,
      barrelId: barrels[19].id, // BBC-020
      severity: AlertSeverity.WARNING,
      message: 'Barril BBC-020 lleva mas de 60 dias sin movimiento',
      targetRoles: [Role.ADMIN, Role.SUPERVISOR],
    },
  })
  await prisma.alert.create({
    data: {
      type: AlertType.BARRIL_PROXIMO_MANTENIMIENTO,
      barrelId: barrels[16].id, // BBC-017
      severity: AlertSeverity.INFO,
      message: 'Barril BBC-017 requiere mantenimiento pronto (355 dias desde el ultimo)',
      targetRoles: [Role.ADMIN, Role.SUPERVISOR, Role.OPERARIO_BODEGA],
    },
  })
  await prisma.alert.create({
    data: {
      type: AlertType.BARRIL_FIN_VIDA_UTIL,
      barrelId: barrels[17].id, // BBC-018
      severity: AlertSeverity.WARNING,
      message: 'Barril BBC-018 tiene menos de 90 dias de vida util restante',
      targetRoles: [Role.ADMIN, Role.SUPERVISOR],
    },
  })
  await prisma.alert.create({
    data: {
      type: AlertType.BARRIL_FIN_VIDA_UTIL,
      barrelId: barrels[18].id, // BBC-019
      severity: AlertSeverity.CRITICAL,
      message: 'CRITICO: Barril BBC-019 vence en menos de 30 dias',
      targetRoles: [Role.ADMIN, Role.SUPERVISOR],
    },
  })
  console.log('Pre-existing alerts created (4)')

  console.log('\nDemo seed complete.')
  console.log(`  Password for all users: ${PASSWORD}`)
  console.log('  Barrels BBC-001 to BBC-020 ready to print QR labels')
  console.log(`  Demo route: "${route.name}" — trans1@bbc.com / Pedro Trans`)
  console.log('  QR labels: http://localhost:3000/barriles/etiquetas?ids=' + ids.slice(0, 10).join(','))
}

main()
  .catch(e => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
