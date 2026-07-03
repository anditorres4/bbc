import 'dotenv/config'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEFAULT_PASSWORD = 'BBC2026!'

async function main() {
  console.log('Seeding BBC Barrel Track database...\n')

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12)

  // ── Usuarios ────────────────────────────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: { email: 'admin@bbc.co' },
    update: {},
    create: {
      email: 'admin@bbc.co',
      passwordHash: hash,
      name: 'Admin BBC',
      phone: '+57 300 111 0001',
      role: Role.ADMIN,
    },
  })

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@bbc.co' },
    update: {},
    create: {
      email: 'supervisor@bbc.co',
      passwordHash: hash,
      name: 'Carlos Herrera',
      phone: '+57 300 111 0002',
      role: Role.SUPERVISOR,
    },
  })

  const operario1 = await prisma.user.upsert({
    where: { email: 'operario1@bbc.co' },
    update: {},
    create: {
      email: 'operario1@bbc.co',
      passwordHash: hash,
      name: 'Juan García',
      phone: '+57 300 111 0003',
      role: Role.OPERARIO_BODEGA,
    },
  })

  const operario2 = await prisma.user.upsert({
    where: { email: 'operario2@bbc.co' },
    update: {},
    create: {
      email: 'operario2@bbc.co',
      passwordHash: hash,
      name: 'María López',
      phone: '+57 300 111 0004',
      role: Role.OPERARIO_BODEGA,
    },
  })

  const trans1 = await prisma.user.upsert({
    where: { email: 'trans1@bbc.co' },
    update: {},
    create: {
      email: 'trans1@bbc.co',
      passwordHash: hash,
      name: 'Pedro Rodríguez',
      phone: '+57 300 111 0005',
      role: Role.TRANSPORTISTA,
    },
  })

  const trans2 = await prisma.user.upsert({
    where: { email: 'trans2@bbc.co' },
    update: {},
    create: {
      email: 'trans2@bbc.co',
      passwordHash: hash,
      name: 'Luis Martínez',
      phone: '+57 300 111 0006',
      role: Role.TRANSPORTISTA,
    },
  })

  const trans3 = await prisma.user.upsert({
    where: { email: 'trans3@bbc.co' },
    update: {},
    create: {
      email: 'trans3@bbc.co',
      passwordHash: hash,
      name: 'Ana Moreno',
      phone: '+57 300 111 0007',
      role: Role.TRANSPORTISTA,
    },
  })

  const produccion1 = await prisma.user.upsert({
    where: { email: 'produccion1@bbc.co' },
    update: {},
    create: {
      email: 'produccion1@bbc.co',
      passwordHash: hash,
      name: 'Sofía Ramírez',
      phone: '+57 300 111 0008',
      role: Role.PRODUCCION,
    },
  })

  console.log('Users created:')
  console.log(`  [ADMIN]          ${admin.email}`)
  console.log(`  [SUPERVISOR]     ${supervisor.email}`)
  console.log(`  [OPERARIO]       ${operario1.email}`)
  console.log(`  [OPERARIO]       ${operario2.email}`)
  console.log(`  [TRANSPORTISTA]  ${trans1.email}`)
  console.log(`  [TRANSPORTISTA]  ${trans2.email}`)
  console.log(`  [TRANSPORTISTA]  ${trans3.email}`)
  console.log(`  [PRODUCCION]     ${produccion1.email}`)

  // ── Productos ─────────────────────────────────────────────────────────────────

  const productCatalog = [
    { name: 'Monserrate Roja', defaultCapacity: 30 },
    { name: 'Monserrate Negra', defaultCapacity: 50 },
    { name: 'Chapinero Porter', defaultCapacity: 30 },
    { name: 'Palo Santo', defaultCapacity: 50 },
    { name: 'BBC IPA', defaultCapacity: 50 },
    { name: 'Cajicá Honey', defaultCapacity: 20 },
    { name: 'Taberna Pale Ale', defaultCapacity: 30 },
    { name: 'Andina Stout', defaultCapacity: 50 },
  ]

  for (const p of productCatalog) {
    await prisma.product.upsert({ where: { name: p.name }, update: {}, create: p })
  }

  console.log(`\nProducts created: ${productCatalog.length}`)

  // ── Puntos de entrega ────────────────────────────────────────────────────────
  // Los barriles NO se crean en el seed — se registran al escanear el QR físico

  const point1 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_barrelfeliz' },
    update: {},
    create: {
      id: 'dp_barrelfeliz',
      name: 'Bar El Barril Feliz',
      address: 'Calle 93 # 11-27, Bogotá',
      lat: 4.6769,
      lng: -74.0477,
      phone: '+57 601 000 0001',
      contactName: 'Roberto Pérez',
    },
  })

  const point2 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_lacerveceria' },
    update: {},
    create: {
      id: 'dp_lacerveceria',
      name: 'Restaurante La Cervecería',
      address: 'Carrera 15 # 85-14, Bogotá',
      lat: 4.6651,
      lng: -74.0535,
      phone: '+57 601 000 0002',
      contactName: 'Andrea Gómez',
    },
  })

  const point3 = await prisma.deliveryPoint.upsert({
    where: { id: 'dp_hopgarden' },
    update: {},
    create: {
      id: 'dp_hopgarden',
      name: 'Pub The Hop Garden',
      address: 'Calle 79 # 7-93, Bogotá',
      lat: 4.6588,
      lng: -74.0523,
      phone: '+57 601 000 0003',
      contactName: 'Felipe Torres',
    },
  })

  console.log('\nDelivery points created:')
  console.log(`  ${point1.name} — ${point1.address}`)
  console.log(`  ${point2.name} — ${point2.address}`)
  console.log(`  ${point3.name} — ${point3.address}`)

  console.log('\nSeed completed.')
  console.log(`\n  Password for all users: ${DEFAULT_PASSWORD}`)
  console.log('  Barrels are NOT seeded — they are registered by scanning the physical QR code.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
