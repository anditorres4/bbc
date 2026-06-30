import 'dotenv/config'
import {
  PrismaClient,
  Role,
  BarrelStatus,
  EventType,
  RouteStatus,
  StopStatus,
  BarrelStopStatus,
  AlertType,
  AlertSeverity,
} from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const PASSWORD = 'BBC2026!'

async function main() {
  console.log('════════════════════════════════════════════════')
  console.log('  BBC Barrel Track — DEMO SEED')
  console.log('════════════════════════════════════════════════\n')

  const hash = await bcrypt.hash(PASSWORD, 12)

  // ── Users ──────────────────────────────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: { email: 'admin@bbc.com' },
    update: {},
    create: { email: 'admin@bbc.com', passwordHash: hash, name: 'Admin Sistema', role: Role.ADMIN },
  })
  await prisma.user.upsert({
    where: { email: 'supervisor@bbc.com' },
    update: {},
    create: { email: 'supervisor@bbc.com', passwordHash: hash, name: 'Carlos Supervisor', role: Role.SUPERVISOR },
  })
  const bodega1 = await prisma.user.upsert({
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
  const trans2 = await prisma.user.upsert({
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
    create: { id: 'dp_el_sabor', name: 'Restaurante El Sabor', address: 'Chapinero, Bogotá', lat: 4.6488, lng: -74.0544, contactName: 'Chef Rodríguez' },
  })
  const dp2 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_la_esquina' },
    update: {},
    create: { id: 'dp_la_esquina', name: 'Bar La Esquina', address: 'Usaquén, Bogotá', lat: 4.6941, lng: -74.0317, contactName: 'Jorge Bar' },
  })
  const dp3 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_club_norte' },
    update: {},
    create: { id: 'dp_club_norte', name: 'Club Social Norte', address: 'Suba, Bogotá', lat: 4.7408, lng: -74.0849, contactName: 'Recepción' },
  })
  const dp4 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_don_pedro' },
    update: {},
    create: { id: 'dp_don_pedro', name: 'Tienda Don Pedro', address: 'La Candelaria, Bogotá', lat: 4.5981, lng: -74.0762, contactName: 'Don Pedro' },
  })
  const dp5 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_hotel_plaza' },
    update: {},
    create: { id: 'dp_hotel_plaza', name: 'Hotel Plaza', address: 'Centro, Bogotá', lat: 4.6097, lng: -74.0817, contactName: 'Coctelería' },
  })
  console.log('Delivery points created (5 Bogotá locations)')

  // ── Cleanup existing transactional data (safe re-seed) ────────────────────

  await prisma.alert.deleteMany({})
  await prisma.barrelEvent.deleteMany({})
  await prisma.routeStopBarrel.deleteMany({})
  await prisma.routeStopRequirement.deleteMany({})
  await prisma.routeBarrel.deleteMany({})
  await prisma.routeStop.deleteMany({})
  await prisma.route.deleteMany({})
  await prisma.barrel.deleteMany({})
  console.log('Existing transactional data cleared')

  await prisma.$executeRaw`ALTER SEQUENCE barrel_id_seq RESTART WITH 1`

  // ── Time helpers ──────────────────────────────────────────────────────────

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function at(h: number, m = 0, daysAgo = 0): Date {
    const d = new Date(today)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(h, m, 0, 0)
    return d
  }

  // ── Barrels ───────────────────────────────────────────────────────────────
  //
  // Barrel assignment for today's two routes:
  //
  //  Route 1 — Ruta Norte (trans1/Pedro):
  //    BBC-001..003  ENTREGADO  @ Restaurante El Sabor  ← ready for empty scan
  //    BBC-004..005  EN_TRANSPORTE → Club Social Norte  (pending delivery)
  //    BBC-011..012  EN_TRANSPORTE → Bar La Esquina     (pending delivery)
  //
  //  Route 2 — Ruta Sur (trans2/Luis):
  //    BBC-013..014  ENTREGADO  @ Tienda Don Pedro      ← ready for empty scan
  //    BBC-006..008  EN_TRANSPORTE → Hotel Plaza        (pending delivery)
  //
  //  Available in bodega:
  //    BBC-009..010  EN_BODEGA   50L Monserrate Negra
  //    BBC-015       EN_BODEGA   30L Monserrate Roja
  //
  //  Special:
  //    BBC-016  EN_MANTENIMIENTO  (in shop)
  //    BBC-017  EN_BODEGA  last service 2025-05-20  → near maintenance alert
  //    BBC-018  EN_BODEGA  manufactured 2016-01-01  → past max life alert
  //    BBC-019  EN_BODEGA  manufactured 2015-06-01  → critical life alert
  //    BBC-020  BAJA

  type BInput = {
    qrCode: string
    status: BarrelStatus
    capacity: number
    manufactureDate: Date
    lastMaintenanceDate?: Date
    product: string
    notes?: string
  }

  async function mkBarrel(input: BInput) {
    return prisma.barrel.create({
      data: { ...input, createdById: admin.id },
    })
  }

  const b001 = await mkBarrel({ qrCode: 'BBC-001', status: BarrelStatus.ENTREGADO,        capacity: 50, manufactureDate: new Date('2020-06-01'), product: 'Monserrate Negra' })
  const b002 = await mkBarrel({ qrCode: 'BBC-002', status: BarrelStatus.ENTREGADO,        capacity: 50, manufactureDate: new Date('2020-09-01'), product: 'Monserrate Negra' })
  const b003 = await mkBarrel({ qrCode: 'BBC-003', status: BarrelStatus.ENTREGADO,        capacity: 50, manufactureDate: new Date('2021-03-15'), product: 'Monserrate Negra' })
  const b004 = await mkBarrel({ qrCode: 'BBC-004', status: BarrelStatus.EN_TRANSPORTE,    capacity: 50, manufactureDate: new Date('2021-06-01'), product: 'Monserrate Negra' })
  const b005 = await mkBarrel({ qrCode: 'BBC-005', status: BarrelStatus.EN_TRANSPORTE,    capacity: 50, manufactureDate: new Date('2022-01-01'), product: 'Monserrate Negra' })
  const b006 = await mkBarrel({ qrCode: 'BBC-006', status: BarrelStatus.EN_TRANSPORTE,    capacity: 50, manufactureDate: new Date('2020-09-01'), product: 'Monserrate Negra' })
  const b007 = await mkBarrel({ qrCode: 'BBC-007', status: BarrelStatus.EN_TRANSPORTE,    capacity: 50, manufactureDate: new Date('2021-09-01'), product: 'Monserrate Negra' })
  const b008 = await mkBarrel({ qrCode: 'BBC-008', status: BarrelStatus.EN_TRANSPORTE,    capacity: 50, manufactureDate: new Date('2022-06-01'), product: 'Monserrate Negra' })
  const b009 = await mkBarrel({ qrCode: 'BBC-009', status: BarrelStatus.EN_BODEGA,        capacity: 50, manufactureDate: new Date('2022-01-01'), product: 'Monserrate Negra' })
  const b010 = await mkBarrel({ qrCode: 'BBC-010', status: BarrelStatus.EN_BODEGA,        capacity: 50, manufactureDate: new Date('2023-01-01'), product: 'Monserrate Negra' })
  const b011 = await mkBarrel({ qrCode: 'BBC-011', status: BarrelStatus.EN_TRANSPORTE,    capacity: 30, manufactureDate: new Date('2022-03-15'), product: 'Monserrate Roja' })
  const b012 = await mkBarrel({ qrCode: 'BBC-012', status: BarrelStatus.EN_TRANSPORTE,    capacity: 30, manufactureDate: new Date('2022-06-01'), product: 'Monserrate Roja' })
  const b013 = await mkBarrel({ qrCode: 'BBC-013', status: BarrelStatus.ENTREGADO,        capacity: 30, manufactureDate: new Date('2022-01-01'), product: 'Monserrate Roja' })
  const b014 = await mkBarrel({ qrCode: 'BBC-014', status: BarrelStatus.ENTREGADO,        capacity: 30, manufactureDate: new Date('2023-01-01'), product: 'Monserrate Roja' })
  const b015 = await mkBarrel({ qrCode: 'BBC-015', status: BarrelStatus.EN_BODEGA,        capacity: 30, manufactureDate: new Date('2023-06-01'), product: 'Monserrate Roja' })
  const b016 = await mkBarrel({ qrCode: 'BBC-016', status: BarrelStatus.EN_MANTENIMIENTO, capacity: 50, manufactureDate: new Date('2020-06-01'), lastMaintenanceDate: new Date('2025-01-01'), product: 'Monserrate Negra' })
  const b017 = await mkBarrel({ qrCode: 'BBC-017', status: BarrelStatus.EN_BODEGA,        capacity: 50, manufactureDate: new Date('2020-06-01'), lastMaintenanceDate: new Date('2025-05-20'), product: 'Monserrate Negra' })
  const b018 = await mkBarrel({ qrCode: 'BBC-018', status: BarrelStatus.EN_BODEGA,        capacity: 30, manufactureDate: new Date('2016-01-01'), product: 'Monserrate Roja' })
  const b019 = await mkBarrel({ qrCode: 'BBC-019', status: BarrelStatus.EN_BODEGA,        capacity: 50, manufactureDate: new Date('2015-06-01'), product: 'Monserrate Negra' })
  const b020 = await mkBarrel({ qrCode: 'BBC-020', status: BarrelStatus.BAJA,             capacity: 50, manufactureDate: new Date('2015-01-01'), product: 'Monserrate Negra', notes: 'Vida útil completada — Mayo 2025' })

  // ── Additional barrels BBC-021..BBC-100 (EN_BODEGA stock) ────────────────
  const EXTRA_PRODUCTS = [
    { product: 'Monserrate Negra', capacity: 50 },
    { product: 'Monserrate Roja',  capacity: 30 },
    { product: 'Monserrate Rubia', capacity: 20 },
    { product: 'Monserrate IPA',   capacity: 50 },
  ]

  const extraBarrels = []
  for (let n = 21; n <= 100; n++) {
    const p = EXTRA_PRODUCTS[(n - 21) % EXTRA_PRODUCTS.length]
    const yearOffset = ((n - 21) % 5)
    const b = await mkBarrel({
      qrCode: `BBC-${String(n).padStart(3, '0')}`,
      status: BarrelStatus.EN_BODEGA,
      capacity: p.capacity,
      manufactureDate: new Date(`${2019 + yearOffset}-${String((n % 12) + 1).padStart(2,'0')}-01`),
      product: p.product,
    })
    extraBarrels.push(b)
  }

  const allBarrels = [b001, b002, b003, b004, b005, b006, b007, b008, b009, b010, b011, b012, b013, b014, b015, b016, b017, b018, b019, b020, ...extraBarrels]
  const ids = allBarrels.map(b => b.id)

  for (let i = 0; i < ids.length; i++) {
    const expected = `BBC-${String(i + 1).padStart(3, '0')}`
    if (ids[i] !== expected) throw new Error(`ID mismatch: expected ${expected}, got ${ids[i]}. Reset the sequence and re-run.`)
  }
  console.log(`Barrels created: BBC-001..BBC-100 (${ids.length} total)`)

  // ── Barrel events (hoja de vida) ───────────────────────────────────────────

  async function addEvent(
    barrelId: string,
    type: EventType,
    fromStatus: BarrelStatus | null,
    toStatus: BarrelStatus,
    userId: string,
    opts: { routeId?: string; deliveryPointId?: string; notes?: string; timestamp?: Date } = {}
  ) {
    return prisma.barrelEvent.create({
      data: {
        barrelId,
        type,
        fromStatus,
        toStatus,
        userId,
        routeId: opts.routeId,
        deliveryPointId: opts.deliveryPointId,
        notes: opts.notes,
        timestamp: opts.timestamp ?? new Date(),
      },
    })
  }

  // All 20 barrels: initial registration (1 week ago)
  for (const b of allBarrels) {
    await addEvent(b.id, EventType.REGISTRO, null, BarrelStatus.EN_BODEGA, admin.id, {
      timestamp: at(10, 0, 7),
      notes: 'Registro inicial — QR escaneado en bodega',
    })
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  const routeDate = new Date(today) // midnight today — date field only
  const dateLabel = today.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

  // Route 1: Ruta Norte — Pedro Trans — already departed (EN_CURSO)
  const route1 = await prisma.route.create({
    data: {
      name: `Ruta Norte — ${dateLabel}`,
      date: routeDate,
      status: RouteStatus.EN_CURSO,
      transportistId: trans1.id,
      vehiclePlate: 'GNF-204',
      departedAt: at(7, 30),
    },
  })

  const s1r1 = await prisma.routeStop.create({
    data: {
      routeId: route1.id,
      deliveryPointId: dp1.id,
      position: 1,
      status: StopStatus.COMPLETADA,
      barrelsAssigned: 3,
      barrelsDelivered: 3,
      barrelsPickedUp: 0,
      deliveredAt: at(9, 15),
      requirements: { create: [{ product: 'Monserrate Negra', quantity: 3 }] },
    },
  })

  await prisma.routeStop.create({
    data: {
      routeId: route1.id,
      deliveryPointId: dp2.id,
      position: 2,
      status: StopStatus.PENDIENTE,
      barrelsAssigned: 2,
      barrelsDelivered: 0,
      barrelsPickedUp: 0,
      requirements: { create: [{ product: 'Monserrate Roja', quantity: 2 }] },
    },
  })

  await prisma.routeStop.create({
    data: {
      routeId: route1.id,
      deliveryPointId: dp3.id,
      position: 3,
      status: StopStatus.PENDIENTE,
      barrelsAssigned: 2,
      barrelsDelivered: 0,
      barrelsPickedUp: 0,
      requirements: { create: [{ product: 'Monserrate Negra', quantity: 2 }] },
    },
  })

  // Route 2: Ruta Sur — Luis Trans — already departed (EN_CURSO)
  const route2 = await prisma.route.create({
    data: {
      name: `Ruta Sur — ${dateLabel}`,
      date: routeDate,
      status: RouteStatus.EN_CURSO,
      transportistId: trans2.id,
      vehiclePlate: 'TYP-850',
      departedAt: at(8, 0),
    },
  })

  const s1r2 = await prisma.routeStop.create({
    data: {
      routeId: route2.id,
      deliveryPointId: dp4.id,
      position: 1,
      status: StopStatus.COMPLETADA,
      barrelsAssigned: 2,
      barrelsDelivered: 2,
      barrelsPickedUp: 0,
      deliveredAt: at(9, 45),
      requirements: { create: [{ product: 'Monserrate Roja', quantity: 2 }] },
    },
  })

  await prisma.routeStop.create({
    data: {
      routeId: route2.id,
      deliveryPointId: dp5.id,
      position: 2,
      status: StopStatus.PENDIENTE,
      barrelsAssigned: 3,
      barrelsDelivered: 0,
      barrelsPickedUp: 0,
      requirements: { create: [{ product: 'Monserrate Negra', quantity: 3 }] },
    },
  })

  console.log(`Routes created: "${route1.name}" and "${route2.name}"`)

  // ── RouteBarrel (all barrels loaded on each truck during alistamiento) ─────

  for (const b of [b001, b002, b003, b004, b005, b011, b012]) {
    await prisma.routeBarrel.create({ data: { routeId: route1.id, barrelId: b.id } })
  }
  for (const b of [b006, b007, b008, b013, b014]) {
    await prisma.routeBarrel.create({ data: { routeId: route2.id, barrelId: b.id } })
  }

  // ── RouteStopBarrel (barrels already delivered at completed stops) ─────────

  // Route 1 / Stop 1 — Restaurante El Sabor: BBC-001..003 delivered (awaiting empty pickup)
  await prisma.routeStopBarrel.create({ data: { routeStopId: s1r1.id, barrelId: b001.id, product: 'Monserrate Negra', status: BarrelStopStatus.ENTREGADO, deliveredAt: at(9, 10) } })
  await prisma.routeStopBarrel.create({ data: { routeStopId: s1r1.id, barrelId: b002.id, product: 'Monserrate Negra', status: BarrelStopStatus.ENTREGADO, deliveredAt: at(9, 12) } })
  await prisma.routeStopBarrel.create({ data: { routeStopId: s1r1.id, barrelId: b003.id, product: 'Monserrate Negra', status: BarrelStopStatus.ENTREGADO, deliveredAt: at(9, 14) } })

  // Route 2 / Stop 1 — Tienda Don Pedro: BBC-013..014 delivered (awaiting empty pickup)
  await prisma.routeStopBarrel.create({ data: { routeStopId: s1r2.id, barrelId: b013.id, product: 'Monserrate Roja', status: BarrelStopStatus.ENTREGADO, deliveredAt: at(9, 40) } })
  await prisma.routeStopBarrel.create({ data: { routeStopId: s1r2.id, barrelId: b014.id, product: 'Monserrate Roja', status: BarrelStopStatus.ENTREGADO, deliveredAt: at(9, 42) } })

  // ── Barrel events — route lifecycle ───────────────────────────────────────

  // Route 1 barrels: ALISTAMIENTO (06:30) + SALIDA_BODEGA (07:30)
  for (const b of [b001, b002, b003, b004, b005, b011, b012]) {
    await addEvent(b.id, EventType.ALISTAMIENTO, BarrelStatus.EN_BODEGA, BarrelStatus.EN_ALISTAMIENTO, bodega1.id, {
      routeId: route1.id, timestamp: at(6, 30), notes: 'Alistamiento Ruta Norte',
    })
    await addEvent(b.id, EventType.SALIDA_BODEGA, BarrelStatus.EN_ALISTAMIENTO, BarrelStatus.EN_TRANSPORTE, trans1.id, {
      routeId: route1.id, timestamp: at(7, 30),
    })
  }

  // Route 2 barrels: ALISTAMIENTO (07:00) + SALIDA_BODEGA (08:00)
  for (const b of [b006, b007, b008, b013, b014]) {
    await addEvent(b.id, EventType.ALISTAMIENTO, BarrelStatus.EN_BODEGA, BarrelStatus.EN_ALISTAMIENTO, bodega1.id, {
      routeId: route2.id, timestamp: at(7, 0), notes: 'Alistamiento Ruta Sur',
    })
    await addEvent(b.id, EventType.SALIDA_BODEGA, BarrelStatus.EN_ALISTAMIENTO, BarrelStatus.EN_TRANSPORTE, trans2.id, {
      routeId: route2.id, timestamp: at(8, 0),
    })
  }

  // Delivered barrels (Route 1 / Stop 1): LLEGADA_PUNTO + ENTREGA_LLENO
  const deliveredR1 = [
    { b: b001, ts: at(9, 10) },
    { b: b002, ts: at(9, 12) },
    { b: b003, ts: at(9, 14) },
  ]
  for (const { b, ts } of deliveredR1) {
    await addEvent(b.id, EventType.LLEGADA_PUNTO, BarrelStatus.EN_TRANSPORTE, BarrelStatus.EN_TRANSPORTE, trans1.id, {
      routeId: route1.id, deliveryPointId: dp1.id, timestamp: new Date(ts.getTime() - 3 * 60000),
    })
    await addEvent(b.id, EventType.ENTREGA_LLENO, BarrelStatus.EN_TRANSPORTE, BarrelStatus.ENTREGADO, trans1.id, {
      routeId: route1.id, deliveryPointId: dp1.id, timestamp: ts,
    })
  }

  // Delivered barrels (Route 2 / Stop 1): LLEGADA_PUNTO + ENTREGA_LLENO
  const deliveredR2 = [
    { b: b013, ts: at(9, 40) },
    { b: b014, ts: at(9, 42) },
  ]
  for (const { b, ts } of deliveredR2) {
    await addEvent(b.id, EventType.LLEGADA_PUNTO, BarrelStatus.EN_TRANSPORTE, BarrelStatus.EN_TRANSPORTE, trans2.id, {
      routeId: route2.id, deliveryPointId: dp4.id, timestamp: new Date(ts.getTime() - 3 * 60000),
    })
    await addEvent(b.id, EventType.ENTREGA_LLENO, BarrelStatus.EN_TRANSPORTE, BarrelStatus.ENTREGADO, trans2.id, {
      routeId: route2.id, deliveryPointId: dp4.id, timestamp: ts,
    })
  }

  // Special barrel events
  await addEvent(b016.id, EventType.ENVIO_MANTENIMIENTO, BarrelStatus.EN_BODEGA, BarrelStatus.EN_MANTENIMIENTO, admin.id, {
    timestamp: at(9, 0, 15), notes: 'Enviado a mantenimiento programado',
  })
  await addEvent(b020.id, EventType.DISPOSICION_FINAL, BarrelStatus.EN_BODEGA, BarrelStatus.BAJA, admin.id, {
    timestamp: at(10, 0, 30), notes: b020.notes ?? 'Barril dado de baja',
  })

  console.log('Barrel events created')

  // ── Alerts ────────────────────────────────────────────────────────────────

  await prisma.alert.create({
    data: {
      type: AlertType.BARRIL_PROXIMO_MANTENIMIENTO,
      barrelId: b017.id,
      severity: AlertSeverity.INFO,
      message: 'BBC-017 requiere mantenimiento pronto — 357 días desde el último servicio (2025-05-20)',
      targetRoles: [Role.ADMIN, Role.SUPERVISOR, Role.OPERARIO_BODEGA],
    },
  })
  await prisma.alert.create({
    data: {
      type: AlertType.BARRIL_FIN_VIDA_UTIL,
      barrelId: b018.id,
      severity: AlertSeverity.WARNING,
      message: 'BBC-018 ha superado su vida útil — fabricado 2016-01-01, vida máxima 10 años',
      targetRoles: [Role.ADMIN, Role.SUPERVISOR],
    },
  })
  await prisma.alert.create({
    data: {
      type: AlertType.BARRIL_FIN_VIDA_UTIL,
      barrelId: b019.id,
      severity: AlertSeverity.CRITICAL,
      message: 'CRÍTICO: BBC-019 superó su vida útil hace más de 11 meses — fabricado 2015-06-01',
      targetRoles: [Role.ADMIN, Role.SUPERVISOR],
    },
  })
  await prisma.alert.create({
    data: {
      type: AlertType.SIN_MOVIMIENTO_60_DIAS,
      barrelId: b020.id,
      severity: AlertSeverity.WARNING,
      message: 'BBC-020 dado de baja — sin movimiento activo',
      targetRoles: [Role.ADMIN, Role.SUPERVISOR],
    },
  })
  console.log('Alerts created (4)')

  // ── Summary ───────────────────────────────────────────────────────────────

  const dateStr = today.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  console.log(`
════════════════════════════════════════════════
  Demo seed complete — ${dateStr}
════════════════════════════════════════════════

  Password (todos los usuarios): ${PASSWORD}

  Usuarios:
    admin@bbc.com         ADMIN
    supervisor@bbc.com    SUPERVISOR
    bodega1@bbc.com       OPERARIO_BODEGA
    bodega2@bbc.com       OPERARIO_BODEGA
    trans1@bbc.com        TRANSPORTISTA  (Pedro Trans)
    trans2@bbc.com        TRANSPORTISTA  (Luis Trans)
    trans3@bbc.com        TRANSPORTISTA  (Ana Trans)

  Rutas de hoy:
    "${route1.name}"  →  trans1@bbc.com
      Parada 1: Restaurante El Sabor  ✓ 3 entregados  ← VACÍOS LISTOS para escanear
        BBC-001, BBC-002, BBC-003
      Parada 2: Bar La Esquina  (BBC-011, BBC-012 en camino)
      Parada 3: Club Social Norte  (BBC-004, BBC-005 en camino)

    "${route2.name}"  →  trans2@bbc.com
      Parada 1: Tienda Don Pedro  ✓ 2 entregados  ← VACÍOS LISTOS para escanear
        BBC-013, BBC-014
      Parada 2: Hotel Plaza  (BBC-006, BBC-007, BBC-008 en camino)

  Barriles en bodega (disponibles):
    BBC-009, BBC-010  50L Monserrate Negra
    BBC-015           30L Monserrate Roja
    BBC-017           EN_BODEGA — próximo a mantenimiento (alerta INFO)
    BBC-018           EN_BODEGA — vida útil vencida (alerta WARNING)
    BBC-019           EN_BODEGA — vida útil crítica (alerta CRITICAL)

  Especiales:
    BBC-016  EN_MANTENIMIENTO
    BBC-020  BAJA

  Stock en bodega:
    BBC-009, BBC-010, BBC-015, BBC-017..BBC-019  (demo especiales)
    BBC-021..BBC-100  (80 barriles adicionales — 4 productos variados)

  Etiquetas QR (admin web):
    http://localhost:3000/barriles/etiquetas?ids=${ids.slice(0, 20).join(',')}
`)
}

main()
  .catch(e => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
