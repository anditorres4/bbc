# Rol Producción — Llenado de Barriles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `PRODUCCION` web role that lets the filling team assign product + production batch ("lote") to barrels currently in bodega, clearing the barrel's content (with full traceability preserved in `BarrelEvent`) when it comes back empty.

**Architecture:** Two new Prisma models (`Product`, `ProductionBatch`) plus two new Express modules (`productos`, `lotes`) following the exact router/service/zod pattern already used by `puntos` and `barriles`. `Barrel.product` stays a free-text string (populated from `Product.name`) to avoid touching the existing string-based product matching in `rutas.service.ts` and reports. A new `/llenado` web page (role-gated) does the batch capture; `AdminSidebar` gets role-based filtering.

**Tech Stack:** Express + Prisma 6 + zod (api), Next.js 14 App Router + react-query + shadcn/ui (web). No new dependencies.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-02-rol-produccion-llenado-design.md` — every task must match it exactly.
- No transition blocks the operator — irregular cases always proceed and emit a `warning` + alert (matches existing `validateTransition` philosophy in `apps/api/src/services/barrelStateMachine.ts`).
- `Barrel.product` remains `String?` — never becomes a FK. Only `ProductionBatch.productId` is a real FK to `Product`.
- All new endpoints follow the existing router style: zod `safeParse`, `authorize(...)` with string role literals, `handleError(err, res)` in the catch block.
- Local dev DB is a **native PostgreSQL Windows service** (not Docker) — `apps/api/.env` already has a working `DATABASE_URL`. Migration commands run directly, no `docker compose up` needed.
- Run `pnpm --filter api test` from the repo root for backend tests; `npx jest --config jest.config.js <file>` from `apps/api/` for a single file.

---

## Task 1: Prisma schema — Product, ProductionBatch, and traceability columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `Role.PRODUCCION`, `EventType.LLENADO`, `Product` model, `ProductionBatch` model, `Barrel.currentBatchId`, `BarrelEvent.product` / `BarrelEvent.batchId` — consumed by every later backend task.

- [ ] **Step 1: Add `PRODUCCION` to the `Role` enum**

In `apps/api/prisma/schema.prisma`, find:

```prisma
enum Role {
  ADMIN
  SUPERVISOR
  OPERARIO_BODEGA
  TRANSPORTISTA
}
```

Replace with:

```prisma
enum Role {
  ADMIN
  SUPERVISOR
  OPERARIO_BODEGA
  TRANSPORTISTA
  PRODUCCION
}
```

- [ ] **Step 2: Add `LLENADO` to the `EventType` enum**

Find:

```prisma
enum EventType {
  REGISTRO
  ALISTAMIENTO
  SALIDA_BODEGA
  LLEGADA_PUNTO
  ENTREGA_LLENO
  RECOGIDA_VACIO
  RETORNO_BODEGA
  ENVIO_MANTENIMIENTO
  RETORNO_MANTENIMIENTO
  DISPOSICION_FINAL
  NOVEDAD
}
```

Replace with:

```prisma
enum EventType {
  REGISTRO
  ALISTAMIENTO
  SALIDA_BODEGA
  LLEGADA_PUNTO
  ENTREGA_LLENO
  RECOGIDA_VACIO
  RETORNO_BODEGA
  ENVIO_MANTENIMIENTO
  RETORNO_MANTENIMIENTO
  DISPOSICION_FINAL
  NOVEDAD
  LLENADO
}
```

- [ ] **Step 3: Add `productionBatches` relation to `User`**

Find the `User` model's relation block:

```prisma
  createdBarrels Barrel[]        @relation("BarrelCreatedBy")
  events         BarrelEvent[]
  routes         Route[]         @relation("RouteTransportist")
  alertsRead     Alert[]         @relation("AlertReadBy")
  refreshTokens  RefreshToken[]
  auditLogs      AuditLog[]
```

Replace with:

```prisma
  createdBarrels    Barrel[]           @relation("BarrelCreatedBy")
  events            BarrelEvent[]
  routes            Route[]            @relation("RouteTransportist")
  alertsRead        Alert[]            @relation("AlertReadBy")
  refreshTokens     RefreshToken[]
  auditLogs         AuditLog[]
  productionBatches ProductionBatch[]
```

- [ ] **Step 4: Add `currentBatchId` to `Barrel`**

Find:

```prisma
  createdBy        User              @relation("BarrelCreatedBy", fields: [createdById], references: [id])
  events           BarrelEvent[]
  routeStopBarrels RouteStopBarrel[]
  routeBarrels     RouteBarrel[]
  alerts           Alert[]
}
```

Replace with:

```prisma
  createdBy        User              @relation("BarrelCreatedBy", fields: [createdById], references: [id])
  events           BarrelEvent[]
  routeStopBarrels RouteStopBarrel[]
  routeBarrels     RouteBarrel[]
  alerts           Alert[]
  currentBatch     ProductionBatch?  @relation("BarrelCurrentBatch", fields: [currentBatchId], references: [id])
}
```

And add the scalar column above the relation block — find:

```prisma
  product             String?
  notes               String?
```

Replace with:

```prisma
  product             String?
  currentBatchId      String?
  notes               String?
```

- [ ] **Step 5: Add `product`/`batchId` to `BarrelEvent`**

Find:

```prisma
  lat             Float?
  lng             Float?
  notes           String?
  novedadType     NovedadType?
  timestamp       DateTime      @default(now())

  barrel        Barrel         @relation(fields: [barrelId], references: [id])
  user          User           @relation(fields: [userId], references: [id])
  route         Route?         @relation(fields: [routeId], references: [id])
  deliveryPoint DeliveryPoint? @relation(fields: [deliveryPointId], references: [id])
```

Replace with:

```prisma
  lat             Float?
  lng             Float?
  notes           String?
  novedadType     NovedadType?
  product         String?
  batchId         String?
  timestamp       DateTime      @default(now())

  barrel        Barrel           @relation(fields: [barrelId], references: [id])
  user          User             @relation(fields: [userId], references: [id])
  route         Route?           @relation(fields: [routeId], references: [id])
  deliveryPoint DeliveryPoint?   @relation(fields: [deliveryPointId], references: [id])
  batch         ProductionBatch? @relation(fields: [batchId], references: [id])
```

- [ ] **Step 6: Add the `Product` and `ProductionBatch` models**

Add at the end of `schema.prisma` (after the `AuditLog` model):

```prisma

model Product {
  id              String   @id @default(cuid())
  name            String   @unique
  defaultCapacity Int?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())

  batches ProductionBatch[]
}

// "Lote" de envasado — un producto + código + fecha, aplicado a N barriles
model ProductionBatch {
  id          String   @id @default(cuid())
  code        String
  productId   String
  fillDate    DateTime
  notes       String?
  createdById String
  createdAt   DateTime @default(now())

  product   Product       @relation(fields: [productId], references: [id])
  createdBy User          @relation(fields: [createdById], references: [id])
  barrels   Barrel[]      @relation("BarrelCurrentBatch")
  events    BarrelEvent[]
}
```

- [ ] **Step 7: Generate and run the migration**

Run from the repo root:

```bash
pnpm --filter api prisma migrate dev --name add_production_role_and_batches
```

Expected: prompts nothing (non-interactive since `--name` is passed), prints `Your database is now in sync with your schema` and a new folder under `apps/api/prisma/migrations/` with a timestamp prefix ending in `_add_production_role_and_batches`.

- [ ] **Step 8: Regenerate the Prisma client**

```bash
pnpm --filter api prisma generate
```

Expected: `Generated Prisma Client` with no errors. This makes `Role.PRODUCCION`, `EventType.LLENADO`, `prisma.product`, `prisma.productionBatch` available to TypeScript.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add PRODUCCION role, Product and ProductionBatch models"
```

---

## Task 2: Fix `recibirBarril` to clear content with traceability

**Files:**
- Modify: `apps/api/src/barriles/barriles.service.ts:9-20` (`createEvent`), `apps/api/src/barriles/barriles.service.ts:166-179` (`fireIrregularAlert`), `apps/api/src/barriles/barriles.service.ts:233-267` (`recibirBarril`)
- Modify: `apps/api/src/__tests__/barriles.integration.test.ts`

**Interfaces:**
- Consumes: `validateTransition(from, to)` from `apps/api/src/services/barrelStateMachine.ts` (unchanged, already returns `{ result: { allowed: true, irregular, warning? }, eventType }`).
- Produces: `export function fireIrregularAlert(message: string, barrelId?: string, routeId?: string): void` (now exported, reused by Task 4's `lotes.service.ts`). `createEvent`'s `extras` type now accepts `product?: string` / `batchId?: string`.

- [ ] **Step 1: Extend `createEvent`'s extras type and export `fireIrregularAlert`**

In `apps/api/src/barriles/barriles.service.ts`, replace:

```ts
async function createEvent(
  barrelId: string,
  type: EventType,
  fromStatus: BarrelStatus | null,
  toStatus: BarrelStatus,
  userId: string,
  extras: { routeId?: string; deliveryPointId?: string; lat?: number; lng?: number; notes?: string } = {}
) {
  return prisma.barrelEvent.create({
    data: { barrelId, type, fromStatus, toStatus, userId, ...extras },
  })
}
```

with:

```ts
async function createEvent(
  barrelId: string,
  type: EventType,
  fromStatus: BarrelStatus | null,
  toStatus: BarrelStatus,
  userId: string,
  extras: {
    routeId?: string
    deliveryPointId?: string
    lat?: number
    lng?: number
    notes?: string
    product?: string
    batchId?: string
  } = {}
) {
  return prisma.barrelEvent.create({
    data: { barrelId, type, fromStatus, toStatus, userId, ...extras },
  })
}
```

Then find:

```ts
function fireIrregularAlert(message: string, barrelId?: string, routeId?: string): void {
```

Replace with:

```ts
export function fireIrregularAlert(message: string, barrelId?: string, routeId?: string): void {
```

- [ ] **Step 2: Rewrite `recibirBarril` to clear `product`/`currentBatchId` with traceability**

Replace the current `recibirBarril` function:

```ts
export async function recibirBarril(id: string, userId: string, notes?: string) {
  const { barrel: updated, warning } = await executeTransition(id, BarrelStatus.EN_BODEGA, userId, { notes })

  // If this barrel was picked up as part of a route, auto-close the route when
  // all empties from that route have now been received at bodega.
  const routeLink = await prisma.routeStopBarrel.findFirst({
```

...through the end of the function (`return { barrel: updated, warning }` and closing `}`), with:

```ts
export async function recibirBarril(id: string, userId: string, notes?: string) {
  const barrel = await findBarrelOrFail(id)
  const { result, eventType } = validateTransition(barrel.status, BarrelStatus.EN_BODEGA)

  const [updated] = await Promise.all([
    prisma.barrel.update({
      where: { id },
      data: { status: BarrelStatus.EN_BODEGA, product: null, currentBatchId: null },
    }),
    createEvent(barrel.id, eventType, barrel.status, BarrelStatus.EN_BODEGA, userId, {
      notes,
      product: barrel.product ?? undefined,
      batchId: barrel.currentBatchId ?? undefined,
    }),
  ])

  if (result.irregular && result.warning) {
    fireIrregularAlert(result.warning, barrel.id)
  }
  const warning = result.irregular ? result.warning : undefined

  // If this barrel was picked up as part of a route, auto-close the route when
  // all empties from that route have now been received at bodega.
  const routeLink = await prisma.routeStopBarrel.findFirst({
    where: { barrelId: id, status: BarrelStopStatus.RECOGIDO_VACIO },
    include: { routeStop: { select: { routeId: true } } },
  })

  if (routeLink) {
    const routeId = routeLink.routeStop.routeId
    const route = await prisma.route.findUnique({ where: { id: routeId } })

    if (route && (route.status === RouteStatus.EN_CURSO || route.status === RouteStatus.CON_NOVEDAD)) {
      const allPickedUp = await prisma.routeStopBarrel.findMany({
        where: { routeStop: { routeId }, status: BarrelStopStatus.RECOGIDO_VACIO },
        include: { barrel: { select: { status: true } } },
      })

      const allReturned = allPickedUp.length > 0 &&
        allPickedUp.every(rsb => rsb.barrel.status === BarrelStatus.EN_BODEGA)

      if (allReturned) {
        await prisma.route.update({
          where: { id: routeId },
          data: { status: RouteStatus.COMPLETADA, arrivedAt: new Date() },
        })
      }
    }
  }

  return { barrel: updated, warning }
}
```

(Everything from `const routeLink = ...` down is untouched, just relocated under the new setup — the route auto-close logic keeps working exactly as before.)

- [ ] **Step 3: Update `makeBarrel` test fixture to support overrides**

In `apps/api/src/__tests__/barriles.integration.test.ts`, replace:

```ts
function makeBarrel(status: string) {
  return {
    id: BARREL_ID,
    qrCode: QR_CODE,
    status,
    capacity: 30,
    manufactureDate: new Date('2020-01-01'),
    lastMaintenanceDate: null,
    maxLifeYears: 10,
    product: null,
    notes: null,
    createdById: 'op-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    events: [],
  }
}
```

with:

```ts
function makeBarrel(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: BARREL_ID,
    qrCode: QR_CODE,
    status,
    capacity: 30,
    manufactureDate: new Date('2020-01-01'),
    lastMaintenanceDate: null,
    maxLifeYears: 10,
    product: null,
    currentBatchId: null,
    notes: null,
    createdById: 'op-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    events: [],
    ...overrides,
  }
}
```

- [ ] **Step 4: Update test 8's assertion for the new `data` shape**

Find (inside `it('8. POST /api/barriles/:id/recibir — transiciona a EN_BODEGA', ...)`):

```ts
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_BODEGA' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RETORNO_BODEGA', toStatus: 'EN_BODEGA' }) })
    )
  })
})
```

Replace with:

```ts
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_BODEGA', product: null, currentBatchId: null } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RETORNO_BODEGA', toStatus: 'EN_BODEGA' }) })
    )
  })

  // ── Step 9: Recibir un barril que traía producto — se limpia y queda trazado ──
  it('9. POST /api/barriles/:id/recibir — limpia product/currentBatchId y preserva trazabilidad en el evento', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(
      makeBarrel('EN_RECOGIDA', { product: 'BBC IPA', currentBatchId: 'batch-1' })
    )
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/recibir`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_BODEGA', product: null, currentBatchId: null } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'RETORNO_BODEGA',
          toStatus: 'EN_BODEGA',
          product: 'BBC IPA',
          batchId: 'batch-1',
        }),
      })
    )
  })
})
```

- [ ] **Step 5: Fix the pre-existing broken "Máquina de estados" test for recibir**

This test currently expects a 400 that the state machine no longer produces (transitions are never blocked — only flagged as irregular with a warning, per `barrelStateMachine.ts`). Find:

```ts
describe('Máquina de estados — transiciones inválidas', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.barrelEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-001' })
  })

  it('rechaza recibir un barril EN_BODEGA (no está EN_RECOGIDA)', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/recibir`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_TRANSITION')
  })

  it('rechaza enviar a mantenimiento un barril en EN_TRANSPORTE', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_TRANSPORTE'))

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/mantenimiento`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_TRANSITION')
  })
```

Replace with:

```ts
describe('Máquina de estados — transiciones inválidas', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.barrelEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-001' })
    ;(prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-001' })
  })

  it('permite recibir un barril EN_BODEGA (irregular) — advierte en vez de bloquear', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_BODEGA'))

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/recibir`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(res.body.warning).toContain('irregular')
  })

  it('permite enviar a mantenimiento un barril en EN_TRANSPORTE (irregular) — advierte en vez de bloquear', async () => {
    ;(prisma.barrel.findUnique as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_TRANSPORTE'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_MANTENIMIENTO'))

    const res = await request(app)
      .post(`/api/barriles/${BARREL_ID}/mantenimiento`)
      .set('Authorization', `Bearer ${operarioToken}`)

    expect(res.status).toBe(200)
    expect(res.body.warning).toContain('irregular')
  })
```

- [ ] **Step 6: Run the barriles test file**

```bash
cd apps/api && npx jest --config jest.config.js src/__tests__/barriles.integration.test.ts
```

Expected: tests `1`, `2`, `8`, `9`, both renamed "Máquina de estados" tests, `rechaza dar de baja...`, both `GET /api/barriles` tests all PASS. Tests `3`-`7` (rutas) and the two `Mantenimiento` describe tests are still failing here — that's expected, they're fixed in Task 11.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/barriles/barriles.service.ts apps/api/src/__tests__/barriles.integration.test.ts
git commit -m "fix(api): clear barrel product/batch on recibir, preserve trazabilidad in event"
```

---

## Task 3: `productos` module (API)

**Files:**
- Create: `apps/api/src/productos/productos.service.ts`
- Create: `apps/api/src/productos/productos.router.ts`
- Create: `apps/api/src/__tests__/productos.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `GET /api/productos`, `POST /api/productos`, `PATCH /api/productos/:id` — consumed by Task 8's `ProductCombobox`, Task 9's `/productos` page, and Task 10's `/llenado` page.

- [ ] **Step 1: Write `productos.service.ts`**

```ts
import { prisma } from '../db/client'
import { AppError } from '../common/errors'

export async function listProducts(filters: { isActive?: boolean }) {
  return prisma.product.findMany({
    where: filters.isActive !== undefined ? { isActive: filters.isActive } : {},
    orderBy: { name: 'asc' },
  })
}

export async function createProduct(data: { name: string; defaultCapacity?: number }) {
  return prisma.product.create({ data })
}

export async function updateProduct(
  id: string,
  data: { name?: string; defaultCapacity?: number; isActive?: boolean }
) {
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) throw new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND')
  return prisma.product.update({ where: { id }, data })
}
```

- [ ] **Step 2: Write `productos.router.ts`**

```ts
import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import * as svc from './productos.service'

const router: Router = Router()

// ── GET /api/productos ──────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({ isActive: z.coerce.boolean().optional() })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const products = await svc.listProducts(parsed.data)
    return res.json({ data: products })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── POST /api/productos ─────────────────────────────────────────────────────
router.post('/', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1, 'El nombre es requerido'),
      defaultCapacity: z.number().int().positive().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const product = await svc.createProduct(parsed.data)
    return res.status(201).json({ data: product })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── PATCH /api/productos/:id ────────────────────────────────────────────────
router.patch('/:id', authenticate, authorize('SUPERVISOR', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params['id'] as string
    const schema = z.object({
      name: z.string().min(1).optional(),
      defaultCapacity: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const product = await svc.updateProduct(id, parsed.data)
    return res.json({ data: product })
  } catch (err) {
    return handleError(err, res)
  }
})

export { router as productosRouter }
```

Note: `GET /api/productos` with no query param returns **all** products (active and inactive) — that's what the `/productos` admin page (Task 9) needs to manage them. Callers that only want active ones (the `/llenado` picker, `ProductCombobox`) pass `?isActive=true` explicitly.

- [ ] **Step 3: Register the router in `app.ts`**

In `apps/api/src/app.ts`, find:

```ts
import { auditoriaRouter } from './auditoria/auditoria.router'
import { authLimiter, scanLimiter, mutationLimiter } from './middleware/rateLimiter'
```

Replace with:

```ts
import { auditoriaRouter } from './auditoria/auditoria.router'
import { productosRouter } from './productos/productos.router'
import { authLimiter, scanLimiter, mutationLimiter } from './middleware/rateLimiter'
```

Then find:

```ts
app.use('/api/reportes', reportesRouter)
app.use('/api/auditoria', auditoriaRouter)
```

Replace with:

```ts
app.use('/api/reportes', reportesRouter)
app.use('/api/auditoria', auditoriaRouter)
app.use('/api/productos', mutationLimiter, productosRouter)
```

`lotesRouter` is wired separately in Task 4 Step 3 — keeping it out of this task means `app.ts` compiles and the test in Step 4 below can run standalone.

- [ ] **Step 4: Write `productos.test.ts`**

```ts
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../app'

jest.mock('../db/client', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const { prisma } = require('../db/client')

const JWT_SECRET = process.env.JWT_SECRET!
function makeToken(role: string, id = 'user-001') {
  return jwt.sign({ sub: id, role }, JWT_SECRET, { expiresIn: '1h' })
}
const adminToken = makeToken('ADMIN', 'admin-001')
const supervisorToken = makeToken('SUPERVISOR', 'sup-001')
const produccionToken = makeToken('PRODUCCION', 'prod-001')

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-001',
    name: 'BBC IPA',
    defaultCapacity: 50,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('GET /api/productos', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requiere autenticación', async () => {
    const res = await request(app).get('/api/productos')
    expect(res.status).toBe(401)
  })

  it('retorna todos los productos sin filtro', async () => {
    ;(prisma.product.findMany as jest.Mock).mockResolvedValueOnce([makeProduct(), makeProduct({ isActive: false })])

    const res = await request(app).get('/api/productos').set('Authorization', `Bearer ${produccionToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
  })

  it('filtra por isActive=true cuando se pide', async () => {
    ;(prisma.product.findMany as jest.Mock).mockResolvedValueOnce([makeProduct()])

    const res = await request(app)
      .get('/api/productos?isActive=true')
      .set('Authorization', `Bearer ${produccionToken}`)

    expect(res.status).toBe(200)
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }))
  })
})

describe('POST /api/productos', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rechaza sin rol SUPERVISOR/ADMIN', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({ name: 'Nueva IPA' })

    expect(res.status).toBe(403)
  })

  it('crea un producto con rol ADMIN', async () => {
    ;(prisma.product.create as jest.Mock).mockResolvedValueOnce(makeProduct({ name: 'Nueva IPA' }))

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Nueva IPA', defaultCapacity: 50 })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Nueva IPA')
  })

  it('rechaza sin nombre', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/productos/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('desactiva un producto con rol SUPERVISOR', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(makeProduct())
    ;(prisma.product.update as jest.Mock).mockResolvedValueOnce(makeProduct({ isActive: false }))

    const res = await request(app)
      .patch('/api/productos/prod-001')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(false)
  })

  it('retorna 404 si el producto no existe', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .patch('/api/productos/no-existe')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 5: Run the new test file**

```bash
cd apps/api && npx jest --config jest.config.js src/__tests__/productos.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/productos apps/api/src/__tests__/productos.test.ts apps/api/src/app.ts
git commit -m "feat(api): add /api/productos catalog endpoints"
```

---

## Task 4: `lotes` module (API) — production batch creation

**Files:**
- Create: `apps/api/src/lotes/lotes.service.ts`
- Create: `apps/api/src/lotes/lotes.router.ts`
- Create: `apps/api/src/__tests__/lotes.test.ts`
- Modify: `apps/api/src/app.ts` (register `lotesRouter`)

**Interfaces:**
- Consumes: `export function fireIrregularAlert(message, barrelId?, routeId?)` from `apps/api/src/barriles/barriles.service.ts` (Task 2).
- Produces: `POST /api/lotes`, `GET /api/lotes`, `GET /api/lotes/:id` — consumed by Task 10's `/llenado` page.

- [ ] **Step 1: Write `lotes.service.ts`**

```ts
import { BarrelStatus, EventType } from '@prisma/client'
import { prisma } from '../db/client'
import { AppError } from '../common/errors'
import { fireIrregularAlert } from '../barriles/barriles.service'

type CreateLoteInput = {
  productId: string
  code: string
  fillDate: Date
  barrelIds: string[]
  notes?: string
  userId: string
}

export async function createLote(input: CreateLoteInput) {
  const { productId, code, fillDate, notes, userId } = input
  const barrelIds = [...new Set(input.barrelIds)]

  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND')

  const barrels = await prisma.barrel.findMany({ where: { id: { in: barrelIds } } })
  if (barrels.length !== barrelIds.length) {
    const found = new Set(barrels.map(b => b.id))
    const missing = barrelIds.filter(id => !found.has(id))
    throw new AppError(`Barriles no encontrados: ${missing.join(', ')}`, 404, 'BARREL_NOT_FOUND')
  }

  const warnings: string[] = []

  const duplicateCode = await prisma.productionBatch.findFirst({
    where: { code: { equals: code, mode: 'insensitive' } },
  })
  if (duplicateCode) {
    const msg = `Código de lote "${code}" ya fue usado el ${duplicateCode.createdAt.toLocaleDateString('es-CO')}`
    warnings.push(msg)
    fireIrregularAlert(msg)
  }

  for (const barrel of barrels) {
    if (barrel.status !== BarrelStatus.EN_BODEGA) {
      const msg = `Barril ${barrel.id} llenado fuera de bodega (estado: ${barrel.status})`
      warnings.push(msg)
      fireIrregularAlert(msg, barrel.id)
    }
    if (barrel.product) {
      const msg = `Barril ${barrel.id} ya tenía producto "${barrel.product}" — reemplazado por "${product.name}"`
      warnings.push(msg)
      fireIrregularAlert(msg, barrel.id)
    }
  }

  const lote = await prisma.$transaction(async tx => {
    const created = await tx.productionBatch.create({
      data: { code, productId, fillDate, notes, createdById: userId },
    })

    for (const barrel of barrels) {
      await tx.barrel.update({
        where: { id: barrel.id },
        data: { product: product.name, currentBatchId: created.id },
      })
      await tx.barrelEvent.create({
        data: {
          barrelId: barrel.id,
          type: EventType.LLENADO,
          fromStatus: barrel.status,
          toStatus: barrel.status,
          userId,
          product: product.name,
          batchId: created.id,
        },
      })
    }

    return created
  })

  return { lote, warnings }
}

export async function listLotes(filters: { createdById?: string }) {
  return prisma.productionBatch.findMany({
    where: filters.createdById ? { createdById: filters.createdById } : {},
    include: {
      product: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      barrels: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function getLote(id: string) {
  const lote = await prisma.productionBatch.findUnique({
    where: { id },
    include: {
      product: true,
      createdBy: { select: { id: true, name: true } },
      barrels: { select: { id: true, qrCode: true, status: true } },
    },
  })
  if (!lote) throw new AppError('Lote no encontrado', 404, 'BATCH_NOT_FOUND')
  return lote
}
```

- [ ] **Step 2: Write `lotes.router.ts`**

```ts
import { Router } from 'express'
import type { Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { handleError } from '../common/errors'
import * as svc from './lotes.service'

const router: Router = Router()

// ── POST /api/lotes ─────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('PRODUCCION', 'SUPERVISOR', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        productId: z.string().min(1),
        code: z.string().min(1, 'El código de lote es requerido'),
        fillDate: z.coerce.date(),
        barrelIds: z.array(z.string().min(1)).min(1, 'Debe seleccionar al menos un barril'),
        notes: z.string().optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

      const result = await svc.createLote({ ...parsed.data, userId: req.user!.id })
      return res.status(201).json({ data: result.lote, warnings: result.warnings })
    } catch (err) {
      return handleError(err, res)
    }
  }
)

// ── GET /api/lotes ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({ mine: z.coerce.boolean().optional() })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message })

    const lotes = await svc.listLotes({ createdById: parsed.data.mine ? req.user!.id : undefined })
    return res.json({ data: lotes })
  } catch (err) {
    return handleError(err, res)
  }
})

// ── GET /api/lotes/:id ──────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const lote = await svc.getLote(req.params['id'] as string)
    return res.json({ data: lote })
  } catch (err) {
    return handleError(err, res)
  }
})

export { router as lotesRouter }
```

- [ ] **Step 3: Register the router in `app.ts`**

In `apps/api/src/app.ts`, find:

```ts
import { productosRouter } from './productos/productos.router'
import { authLimiter, scanLimiter, mutationLimiter } from './middleware/rateLimiter'
```

Replace with:

```ts
import { productosRouter } from './productos/productos.router'
import { lotesRouter } from './lotes/lotes.router'
import { authLimiter, scanLimiter, mutationLimiter } from './middleware/rateLimiter'
```

Then find:

```ts
app.use('/api/productos', mutationLimiter, productosRouter)
```

Replace with:

```ts
app.use('/api/productos', mutationLimiter, productosRouter)
app.use('/api/lotes', mutationLimiter, lotesRouter)
```

- [ ] **Step 4: Write `lotes.test.ts`**

```ts
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../app'

jest.mock('../db/client', () => ({
  prisma: {
    product: { findUnique: jest.fn() },
    barrel: { findMany: jest.fn(), update: jest.fn() },
    productionBatch: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    barrelEvent: { create: jest.fn() },
    alert: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaSelf)),
  },
}))

const { prisma: prismaSelf } = require('../db/client')
const { prisma } = require('../db/client')

const JWT_SECRET = process.env.JWT_SECRET!
function makeToken(role: string, id = 'user-001') {
  return jwt.sign({ sub: id, role }, JWT_SECRET, { expiresIn: '1h' })
}
const produccionToken = makeToken('PRODUCCION', 'prod-001')
const operarioToken = makeToken('OPERARIO_BODEGA', 'op-001')

const PRODUCT = { id: 'prod-001', name: 'BBC IPA', defaultCapacity: 50, isActive: true, createdAt: new Date() }

function makeBarrel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'BBC-001',
    qrCode: 'QR-001',
    status: 'EN_BODEGA',
    product: null,
    currentBatchId: null,
    capacity: 50,
    ...overrides,
  }
}

describe('POST /api/lotes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-001' })
    ;(prisma.productionBatch.create as jest.Mock).mockResolvedValue({ id: 'batch-001', code: 'L-001' })
    ;(prisma.barrel.update as jest.Mock).mockResolvedValue({})
    ;(prisma.barrelEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-001' })
  })

  it('rechaza sin rol PRODUCCION/SUPERVISOR/ADMIN', async () => {
    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'x', role: 'TRANSPORTISTA' }, JWT_SECRET)}`)
      .send({ productId: 'prod-001', code: 'L-001', fillDate: new Date().toISOString(), barrelIds: ['BBC-001'] })

    expect(res.status).toBe(403)
  })

  it('crea un lote y actualiza los barriles seleccionados sin advertencias', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(PRODUCT)
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel()])
    ;(prisma.productionBatch.findFirst as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({
        productId: 'prod-001',
        code: 'L-001',
        fillDate: new Date().toISOString(),
        barrelIds: ['BBC-001'],
      })

    expect(res.status).toBe(201)
    expect(res.body.warnings).toEqual([])
    expect(prisma.barrel.update).toHaveBeenCalledWith({
      where: { id: 'BBC-001' },
      data: { product: 'BBC IPA', currentBatchId: 'batch-001' },
    })
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'LLENADO', product: 'BBC IPA', batchId: 'batch-001' }),
    })
  })

  it('advierte pero permite llenar un barril fuera de bodega', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(PRODUCT)
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel({ status: 'EN_TRANSPORTE' })])
    ;(prisma.productionBatch.findFirst as jest.Mock).mockResolvedValueOnce(null)

    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${operarioToken}`)
      .send({ productId: 'prod-001', code: 'L-002', fillDate: new Date().toISOString(), barrelIds: ['BBC-001'] })

    expect(res.status).toBe(201)
    expect(res.body.warnings[0]).toContain('fuera de bodega')
  })

  it('advierte pero permite un código de lote duplicado', async () => {
    ;(prisma.product.findUnique as jest.Mock).mockResolvedValueOnce(PRODUCT)
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel()])
    ;(prisma.productionBatch.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'batch-old',
      code: 'L-001',
      createdAt: new Date('2026-01-01'),
    })

    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({ productId: 'prod-001', code: 'L-001', fillDate: new Date().toISOString(), barrelIds: ['BBC-001'] })

    expect(res.status).toBe(201)
    expect(res.body.warnings[0]).toContain('ya fue usado')
  })

  it('retorna 400 sin barriles seleccionados', async () => {
    const res = await request(app)
      .post('/api/lotes')
      .set('Authorization', `Bearer ${produccionToken}`)
      .send({ productId: 'prod-001', code: 'L-001', fillDate: new Date().toISOString(), barrelIds: [] })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/lotes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('filtra por mine=true usando el usuario autenticado', async () => {
    ;(prisma.productionBatch.findMany as jest.Mock).mockResolvedValueOnce([])

    const res = await request(app).get('/api/lotes?mine=true').set('Authorization', `Bearer ${produccionToken}`)

    expect(res.status).toBe(200)
    expect(prisma.productionBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdById: 'prod-001' } })
    )
  })
})
```

- [ ] **Step 5: Run the new test file**

```bash
cd apps/api && npx jest --config jest.config.js src/__tests__/lotes.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Run the full backend test suite to confirm nothing else broke**

```bash
cd apps/api && npx jest --config jest.config.js
```

Expected: `auth.test.ts`, `app.cors.test.ts`, `productos.test.ts`, `lotes.test.ts` all green. `barriles.integration.test.ts` still shows the rutas + mantenimiento failures — expected until Task 11 runs.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lotes apps/api/src/__tests__/lotes.test.ts apps/api/src/app.ts
git commit -m "feat(api): add /api/lotes production batch endpoint"
```

---

## Task 5: Seed — PRODUCCION user and product catalog

**Files:**
- Modify: `apps/api/src/db/seed.ts`

- [ ] **Step 1: Add the `produccion1` user**

In `apps/api/src/db/seed.ts`, find:

```ts
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

  console.log('Users created:')
```

Replace with:

```ts
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
```

Then find:

```ts
  console.log(`  [TRANSPORTISTA]  ${trans3.email}`)

  // ── Puntos de entrega ────────────────────────────────────────────────────────
```

Replace with:

```ts
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
```

- [ ] **Step 2: Run the seed against the local DB**

```bash
pnpm --filter api run db:seed
```

Expected output includes `[PRODUCCION]     produccion1@bbc.co` and `Products created: 8`, ending with `Seed completed.`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/seed.ts
git commit -m "feat(api): seed PRODUCCION user and product catalog"
```

---

## Task 6: Web types

**Files:**
- Modify: `apps/web/src/lib/types.ts`

**Interfaces:**
- Produces: `Role` (with `'PRODUCCION'`), `EventType` (with `'LLENADO'`), `Product`, `ProductionBatch` interfaces, `Barrel.currentBatchId`, `BarrelEvent.product`/`batchId` — consumed by Tasks 7, 8, 9, 10.

- [ ] **Step 1: Extend `Role` and `EventType`**

In `apps/web/src/lib/types.ts`, find:

```ts
export type Role = 'ADMIN' | 'SUPERVISOR' | 'OPERARIO_BODEGA' | 'TRANSPORTISTA'
```

Replace with:

```ts
export type Role = 'ADMIN' | 'SUPERVISOR' | 'OPERARIO_BODEGA' | 'TRANSPORTISTA' | 'PRODUCCION'
```

Find:

```ts
export type EventType =
  | 'REGISTRO'
  | 'ALISTAMIENTO'
  | 'SALIDA_BODEGA'
  | 'LLEGADA_PUNTO'
  | 'ENTREGA_LLENO'
  | 'RECOGIDA_VACIO'
  | 'RETORNO_BODEGA'
  | 'ENVIO_MANTENIMIENTO'
  | 'RETORNO_MANTENIMIENTO'
  | 'DISPOSICION_FINAL'
  | 'NOVEDAD'
```

Replace with:

```ts
export type EventType =
  | 'REGISTRO'
  | 'ALISTAMIENTO'
  | 'SALIDA_BODEGA'
  | 'LLEGADA_PUNTO'
  | 'ENTREGA_LLENO'
  | 'RECOGIDA_VACIO'
  | 'RETORNO_BODEGA'
  | 'ENVIO_MANTENIMIENTO'
  | 'RETORNO_MANTENIMIENTO'
  | 'DISPOSICION_FINAL'
  | 'NOVEDAD'
  | 'LLENADO'
```

- [ ] **Step 2: Add `currentBatchId` to `Barrel` and `product`/`batchId` to `BarrelEvent`**

Find:

```ts
export interface Barrel {
  id: string
  qrCode: string
  status: BarrelStatus
  product: string | null
  capacity: number
  manufactureDate: string
  lastMaintenanceDate: string | null
  maxLifeYears: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy?: Pick<User, 'id' | 'name'>
}
```

Replace with:

```ts
export interface Barrel {
  id: string
  qrCode: string
  status: BarrelStatus
  product: string | null
  currentBatchId: string | null
  capacity: number
  manufactureDate: string
  lastMaintenanceDate: string | null
  maxLifeYears: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  createdBy?: Pick<User, 'id' | 'name'>
}
```

Find:

```ts
export interface BarrelEvent {
  id: string
  barrelId: string
  type: EventType
  fromStatus: BarrelStatus | null
  toStatus: BarrelStatus
  userId: string
  routeId: string | null
  deliveryPointId: string | null
  lat: number | null
  lng: number | null
  notes: string | null
  novedadType: NovedadType | null
  timestamp: string
  user?: Pick<User, 'id' | 'name'>
}
```

Replace with:

```ts
export interface BarrelEvent {
  id: string
  barrelId: string
  type: EventType
  fromStatus: BarrelStatus | null
  toStatus: BarrelStatus
  userId: string
  routeId: string | null
  deliveryPointId: string | null
  lat: number | null
  lng: number | null
  notes: string | null
  novedadType: NovedadType | null
  product: string | null
  batchId: string | null
  timestamp: string
  user?: Pick<User, 'id' | 'name'>
}
```

- [ ] **Step 3: Add `Product` and `ProductionBatch` interfaces**

Add after the `DeliveryPoint` interface:

```ts
export interface Product {
  id: string
  name: string
  defaultCapacity: number | null
  isActive: boolean
  createdAt: string
}

export interface ProductionBatch {
  id: string
  code: string
  productId: string
  fillDate: string
  notes: string | null
  createdById: string
  createdAt: string
  product?: Pick<Product, 'id' | 'name'>
  createdBy?: Pick<User, 'id' | 'name'>
  barrels?: Pick<Barrel, 'id'>[]
}
```

- [ ] **Step 4: Type-check the web app**

```bash
pnpm --filter web run type-check
```

If there's no `type-check` script, run `pnpm --filter web exec tsc --noEmit` instead. Expected: no errors (these are additive changes; nothing currently reads the new fields).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/types.ts
git commit -m "feat(web): add PRODUCCION role, Product/ProductionBatch types"
```

---

## Task 7: Role-based sidebar + `/llenado` route guard

**Files:**
- Modify: `apps/web/src/components/AdminSidebar.tsx`
- Modify: `apps/web/src/app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `Role` from `apps/web/src/lib/types.ts` (Task 6).
- Produces: `<AdminSidebar role={role} />` prop — no other file depends on this yet until Task 9/10's pages exist, but the nav item and guard are needed before those pages are reachable in a real click-through.

- [ ] **Step 1: Add role-based filtering and the "Llenado" nav item**

In `apps/web/src/components/AdminSidebar.tsx`, find:

```ts
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Beer, LayoutDashboard, Package, Truck, Bell, Users, LogOut, BarChart2, Wrench, ShieldCheck, MapPin
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { clearAccessToken } from '@/lib/auth'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/barriles', label: 'Barriles', icon: Package },
  { href: '/rutas', label: 'Rutas', icon: Truck },
  { href: '/puntos-entrega', label: 'Puntos de Entrega', icon: MapPin },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/mantenimiento', label: 'Mantenimiento', icon: Wrench },
  { href: '/reportes', label: 'Reportes', icon: BarChart2 },
  { href: '/auditoria', label: 'Auditoría', icon: ShieldCheck },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
```

Replace with:

```ts
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Beer, LayoutDashboard, Package, Truck, Bell, Users, LogOut, BarChart2, Wrench, ShieldCheck, MapPin, Droplets, FlaskConical
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { clearAccessToken } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import type { Role } from '@/lib/types'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/barriles', label: 'Barriles', icon: Package },
  { href: '/llenado', label: 'Llenado', icon: Droplets },
  { href: '/rutas', label: 'Rutas', icon: Truck },
  { href: '/puntos-entrega', label: 'Puntos de Entrega', icon: MapPin },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/mantenimiento', label: 'Mantenimiento', icon: Wrench },
  { href: '/productos', label: 'Productos', icon: FlaskConical },
  { href: '/reportes', label: 'Reportes', icon: BarChart2 },
  { href: '/auditoria', label: 'Auditoría', icon: ShieldCheck },
]

// Rutas visibles para cada rol restringido. Los roles no listados aquí ven todo el NAV.
const NAV_BY_ROLE: Partial<Record<Role, string[]>> = {
  PRODUCCION: ['/llenado', '/barriles'],
}

interface Props {
  role?: Role
}

export function AdminSidebar({ role }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const allowedHrefs = role ? NAV_BY_ROLE[role] : undefined
  const visibleNav = allowedHrefs ? NAV.filter(item => allowedHrefs.includes(item.href)) : NAV
```

Then find:

```ts
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
```

Replace with:

```ts
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {visibleNav.map(({ href, label, icon: Icon }) => {
```

`/productos` is added to the full `NAV` list here too (needed by Task 9) — it will only be reachable by roles that see the unfiltered nav (ADMIN/SUPERVISOR/OPERARIO_BODEGA/TRANSPORTISTA today, matching current behavior where nothing is role-filtered except the new `PRODUCCION` entry).

- [ ] **Step 2: Pass `role` to `AdminSidebar` and add the redirect guard**

In `apps/web/src/app/(admin)/layout.tsx`, find:

```ts
    if (path.includes('/reportes')) return 'Reportes'
    return 'BBC Barrel Track'
  })()

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAFAF8]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader title={pageTitle} user={user ?? undefined} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

Replace with:

```ts
    if (path.includes('/reportes')) return 'Reportes'
    if (path.includes('/llenado')) return 'Llenado'
    if (path.includes('/productos')) return 'Productos'
    return 'BBC Barrel Track'
  })()

  const PRODUCCION_ALLOWED_PREFIXES = ['/llenado', '/barriles']
  useEffect(() => {
    if (!user || user.role !== 'PRODUCCION') return
    if (typeof window === 'undefined') return
    const path = window.location.pathname
    const allowed = PRODUCCION_ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))
    if (!allowed) router.replace('/llenado')
  }, [user, router])

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAFAF8]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar role={user?.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader title={pageTitle} user={user ?? undefined} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/AdminSidebar.tsx "apps/web/src/app/(admin)/layout.tsx"
git commit -m "feat(web): role-filtered sidebar and route guard for PRODUCCION"
```

---

## Task 8: `ProductCombobox` reads from `/api/productos`

**Files:**
- Modify: `apps/web/src/components/ui/ProductCombobox.tsx`
- Delete: `apps/web/src/lib/constants.ts`

**Interfaces:**
- Consumes: `GET /api/productos?isActive=true` (Task 3).
- Produces: same `{ value, onChange, placeholder?, className? }` props — no change to callers (`apps/web/src/app/(admin)/rutas/nueva/page.tsx` needs zero edits).

- [ ] **Step 1: Confirm `BBC_PRODUCTS` has no other usages**

```bash
grep -rn "BBC_PRODUCTS\|lib/constants" apps/web/src
```

Expected: only `apps/web/src/components/ui/ProductCombobox.tsx` and `apps/web/src/lib/constants.ts` itself. If anything else shows up, stop and re-check before deleting the file in Step 3.

- [ ] **Step 2: Fetch products instead of the static array**

In `apps/web/src/components/ui/ProductCombobox.tsx`, find:

```ts
'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BBC_PRODUCTS } from '@/lib/constants'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function ProductCombobox({ value, onChange, placeholder = 'Seleccionar producto', className }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = BBC_PRODUCTS.filter(p =>
    p.toLowerCase().includes(search.toLowerCase())
  )
```

Replace with:

```ts
'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { Product } from '@/lib/types'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function ProductCombobox({ value, onChange, placeholder = 'Seleccionar producto', className }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: products = [] } = useQuery({
    queryKey: ['productos', 'active'],
    queryFn: () => api.get<{ data: Product[] }>('/api/productos?isActive=true').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const filtered = products
    .map(p => p.name)
    .filter(name => name.toLowerCase().includes(search.toLowerCase()))
```

- [ ] **Step 3: Delete the now-unused constants file**

```bash
rm apps/web/src/lib/constants.ts
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/ProductCombobox.tsx
git rm apps/web/src/lib/constants.ts
git commit -m "refactor(web): ProductCombobox reads from /api/productos catalog"
```

---

## Task 9: `/productos` admin page

**Files:**
- Create: `apps/web/src/app/(admin)/productos/page.tsx`

**Interfaces:**
- Consumes: `GET /api/productos`, `POST /api/productos`, `PATCH /api/productos/:id` (Task 3); `Product` type (Task 6); `DataTable`, `Dialog`, `Input`, `Label`, `Button` from existing `@/components/ui/*`.

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { api } from '@/lib/api'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { Product } from '@/lib/types'

type FormValues = { name: string; defaultCapacity?: number }

export default function ProductosPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, reset } = useForm<FormValues>()

  const { data, isLoading } = useQuery({
    queryKey: ['productos', 'all'],
    queryFn: () => api.get<{ data: Product[] }>('/api/productos').then(r => r.data),
  })

  function openCreate() {
    setEditing(null)
    reset({ name: '', defaultCapacity: undefined })
    setDialogOpen(true)
  }

  function openEdit(product: Product) {
    setEditing(product)
    reset({ name: product.name, defaultCapacity: product.defaultCapacity ?? undefined })
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    setError(null)
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/api/productos/${editing.id}`, values)
      } else {
        await api.post('/api/productos', values)
      }
      qc.invalidateQueries({ queryKey: ['productos'] })
      setDialogOpen(false)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message ?? 'Error al guardar el producto')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(product: Product) {
    await api.patch(`/api/productos/${product.id}`, { isActive: !product.isActive })
    qc.invalidateQueries({ queryKey: ['productos'] })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-800">Productos</h2>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo Producto
        </Button>
      </div>

      <DataTable<Product & Record<string, unknown>>
        loading={isLoading}
        data={(data ?? []) as (Product & Record<string, unknown>)[]}
        emptyMessage="No hay productos registrados"
        onRowClick={row => openEdit(row)}
        columns={[
          { key: 'name', header: 'Nombre', sortable: true },
          {
            key: 'defaultCapacity',
            header: 'Capacidad default',
            render: row => (row.defaultCapacity ? `${row.defaultCapacity} L` : '—'),
          },
          {
            key: 'isActive',
            header: 'Estado',
            render: row => (
              <Badge variant={row.isActive ? 'default' : 'secondary'}>
                {row.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: '',
            render: row => (
              <Button
                variant="outline"
                size="sm"
                onClick={e => { e.stopPropagation(); toggleActive(row) }}
              >
                {row.isActive ? 'Desactivar' : 'Activar'}
              </Button>
            ),
          },
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); setError(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
            <DialogDescription>
              El nombre es el que verá el equipo de producción al armar un lote.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" autoFocus {...register('name', { required: 'El nombre es requerido' })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="defaultCapacity">Capacidad default (L)</Label>
              <Input
                id="defaultCapacity"
                type="number"
                {...register('defaultCapacity', { valueAsNumber: true })}
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

```bash
pnpm dev
```

Log in as `admin@bbc.co` / `BBC2026!`, navigate to `/productos`. Expected: table with the 8 seeded products, "Nuevo Producto" opens a dialog that creates a product on submit, clicking a row opens it pre-filled for editing, "Desactivar"/"Activar" toggles the badge without a page reload.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(admin)/productos"
git commit -m "feat(web): add /productos admin CRUD page"
```

---

## Task 10: `/llenado` page

**Files:**
- Create: `apps/web/src/app/(admin)/llenado/page.tsx`

**Interfaces:**
- Consumes: `GET /api/productos?isActive=true`, `POST /api/barriles/scan`, `GET /api/barriles?status=EN_BODEGA`, `POST /api/lotes`, `GET /api/lotes?mine=true`; `Product`, `Barrel`, `ProductionBatch` types (Task 6); `DataTable`, `Badge`, `Button`, `Input`, `Label` from existing `@/components/ui/*`.

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { api } from '@/lib/api'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatRelative, getLocalDateInputValue } from '@/lib/utils'
import type { Barrel, PaginatedResponse, Product, ProductionBatch } from '@/lib/types'

export default function LlenadoPage() {
  const qc = useQueryClient()

  const [productId, setProductId] = useState('')
  const [code, setCode] = useState('')
  const [fillDate, setFillDate] = useState(getLocalDateInputValue())
  const [selected, setSelected] = useState<Map<string, Barrel>>(new Map())
  const [scanValue, setScanValue] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)

  const { data: products = [] } = useQuery({
    queryKey: ['productos', 'active'],
    queryFn: () => api.get<{ data: Product[] }>('/api/productos?isActive=true').then(r => r.data),
  })

  const { data: barrelPage, isLoading: barrelsLoading } = useQuery({
    queryKey: ['barriles', 'en-bodega', search],
    queryFn: () => {
      const params = new URLSearchParams({ status: 'EN_BODEGA', pageSize: '50' })
      if (search) params.set('search', search)
      return api.get<PaginatedResponse<Barrel>>(`/api/barriles?${params}`)
    },
  })

  const { data: misLotes } = useQuery({
    queryKey: ['lotes', 'mine'],
    queryFn: () => api.get<{ data: ProductionBatch[] }>('/api/lotes?mine=true').then(r => r.data),
  })

  const loteReady = productId !== '' && code.trim() !== ''
  const selectedProduct = products.find(p => p.id === productId)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function addBarrel(barrel: Barrel) {
    if (selected.has(barrel.id)) {
      showToast(`${barrel.id} ya está en la lista`)
      return
    }
    setSelected(prev => new Map(prev).set(barrel.id, barrel))
  }

  function removeBarrel(id: string) {
    setSelected(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  async function onScanSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!scanValue.trim()) return
    setScanError(null)
    try {
      const res = await api.post<{ barrel: Barrel }>('/api/barriles/scan', { qrCode: scanValue.trim() })
      addBarrel(res.barrel)
      setScanValue('')
    } catch (err: unknown) {
      const e2 = err as { message?: string }
      setScanError(e2?.message ?? 'Error al escanear')
    } finally {
      scanInputRef.current?.focus()
    }
  }

  async function confirmLote() {
    if (!loteReady || selected.size === 0 || confirming) return
    setConfirming(true)
    try {
      const res = await api.post<{ data: ProductionBatch; warnings: string[] }>('/api/lotes', {
        productId,
        code,
        fillDate: new Date(fillDate).toISOString(),
        barrelIds: [...selected.keys()],
      })
      setSelected(new Map())
      qc.invalidateQueries({ queryKey: ['barriles', 'en-bodega'] })
      qc.invalidateQueries({ queryKey: ['lotes', 'mine'] })
      if (res.warnings.length > 0) {
        showToast(res.warnings[0] as string)
      } else {
        showToast(`Lote "${res.data.code}" confirmado — ${selected.size} barril(es)`)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      showToast(e?.message ?? 'Error al confirmar el lote')
    } finally {
      setConfirming(false)
    }
  }

  const barrels = useMemo(() => barrelPage?.items ?? [], [barrelPage])

  return (
    <div className="space-y-5">
      {/* Formulario de lote */}
      <div className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-stone-800">1. Datos del lote</h2>
        <div>
          <Label>Producto</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {products.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProductId(p.id)}
                className={
                  productId === p.id
                    ? 'rounded-lg border-2 border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800'
                    : 'rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-400'
                }
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="code">Código de lote</Label>
            <Input id="code" value={code} onChange={e => setCode(e.target.value)} placeholder="L-2026-001" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fillDate">Fecha de envasado</Label>
            <Input id="fillDate" type="date" value={fillDate} onChange={e => setFillDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Captura de barriles */}
      <div className={loteReady ? 'space-y-4' : 'space-y-4 opacity-40 pointer-events-none'}>
        <div className="rounded-xl border bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-stone-800">2. Escanear o seleccionar barriles</h2>
          <form onSubmit={onScanSubmit} className="flex gap-2 max-w-md">
            <Input
              ref={scanInputRef}
              autoFocus
              placeholder="Escanear código QR…"
              value={scanValue}
              onChange={e => setScanValue(e.target.value)}
            />
            <Button type="submit">Agregar</Button>
          </form>
          {scanError && <p className="text-xs text-red-500">{scanError}</p>}

          <Input
            placeholder="Buscar barril por ID…"
            className="max-w-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <DataTable<Barrel & Record<string, unknown>>
            loading={barrelsLoading}
            data={barrels as (Barrel & Record<string, unknown>)[]}
            emptyMessage="No hay barriles en bodega"
            onRowClick={row => addBarrel(row)}
            columns={[
              { key: 'id', header: 'ID' },
              {
                key: 'product',
                header: 'Producto actual',
                render: row => (row.product ? <Badge variant="destructive">{row.product}</Badge> : '—'),
              },
              { key: 'capacity', header: 'Capacidad', render: row => `${row.capacity} L` },
              {
                key: 'select',
                header: '',
                render: row => (selected.has(row.id) ? <CheckCircle2 className="h-4 w-4 text-amber-600" /> : null),
              },
            ]}
          />
        </div>

        {/* Lista acumulada */}
        {selected.size > 0 && (
          <div className="rounded-xl border bg-white p-5 space-y-2">
            <h2 className="text-sm font-semibold text-stone-800">
              3. Barriles del lote ({selected.size})
            </h2>
            {[...selected.values()].map(b => (
              <div key={b.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
                <div className="flex items-center gap-2">
                  {b.product && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  <span className="font-medium">{b.id}</span>
                  {b.product && <span className="text-stone-500">ya tenía: {b.product}</span>}
                </div>
                <button onClick={() => removeBarrel(b.id)} className="text-stone-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={confirmLote} disabled={confirming}>
                {confirming ? 'Confirmando…' : `Confirmar Lote (${selected.size})`}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Historial del día */}
      {misLotes && misLotes.length > 0 && (
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-stone-800">Mis lotes recientes</h2>
          <div className="space-y-2">
            {misLotes.map(lote => (
              <div key={lote.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
                <div>
                  <span className="font-medium">{lote.code}</span>
                  <span className="ml-2 text-stone-500">{lote.product?.name}</span>
                </div>
                <div className="flex items-center gap-3 text-stone-500">
                  <span>{lote.barrels?.length ?? 0} barril(es)</span>
                  <span>{formatRelative(lote.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

```bash
pnpm dev
```

Log in as `produccion1@bbc.co` / `BBC2026!`. Expected: sidebar shows only **Llenado** and **Barriles**; navigating to `/rutas` directly redirects back to `/llenado`. On `/llenado`: pick a product button, type a lote code, use the scan input (type an existing `BBC-0XX` id + Enter) or click a row in the manual grid to add a barrel to the accumulated list, click "Confirmar Lote" and see it clear + appear under "Mis lotes recientes". Re-check in `/barriles` that the barrel's `product` column now shows the assigned product.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(admin)/llenado"
git commit -m "feat(web): add /llenado production batch capture page"
```

---

## Task 11: Fix pre-existing broken tests (rutas + mantenimiento)

This is **unrelated to the production/llenado feature** — discovered while touching `barriles.integration.test.ts` in Task 2. Bundled in per explicit user request rather than left as separate debt.

**Files:**
- Modify: `apps/api/src/__tests__/barriles.integration.test.ts`

**Interfaces:**
- None — test-only changes, no production code touched in this task.

- [ ] **Step 1: Expand the mocked Prisma client**

Find the `jest.mock('../db/client', ...)` block at the top of the file:

```ts
jest.mock('../db/client', () => ({
  prisma: {
    barrel: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    barrelEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    route: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    routeStop: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    routeStopBarrel: {
      updateMany: jest.fn(),
    },
    alert: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    deliveryPoint: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}))
```

Replace with:

```ts
jest.mock('../db/client', () => ({
  prisma: {
    barrel: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    barrelEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    route: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    routeStop: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    routeStopBarrel: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    routeBarrel: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    alert: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    deliveryPoint: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
    },
  },
}))
```

- [ ] **Step 2: Rewrite the `makeRoute` fixture to match the current requirements-based model**

Find:

```ts
function makeRoute(status: string) {
  return {
    id: ROUTE_ID,
    name: 'Ruta Test',
    date: new Date(),
    status,
    transportistId: 'trans-001',
    vehiclePlate: 'ABC123',
    departedAt: null,
    arrivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    stops: [
      {
        id: STOP_ID,
        routeId: ROUTE_ID,
        deliveryPointId: POINT_ID,
        position: 1,
        status: 'PENDIENTE',
        barrelsAssigned: 1,
        barrelsDelivered: 0,
        barrelsPickedUp: 0,
        deliveredAt: null,
        lat: null,
        lng: null,
        deliveryPoint: { id: POINT_ID, name: 'Bar El Barril Feliz' },
        barrels: [{ id: 'rsb-001', routeStopId: STOP_ID, barrelId: BARREL_ID, product: 'Lager', status: 'ASIGNADO' }],
      },
    ],
  }
}
```

Replace with:

```ts
function makeRoute(status: string) {
  return {
    id: ROUTE_ID,
    name: 'Ruta Test',
    date: new Date(),
    status,
    transportistId: 'trans-001',
    vehiclePlate: 'ABC123',
    departedAt: null,
    arrivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    transportist: { id: 'trans-001', name: 'Pedro Rodríguez' },
    stops: [
      {
        id: STOP_ID,
        routeId: ROUTE_ID,
        deliveryPointId: POINT_ID,
        position: 1,
        status: 'PENDIENTE',
        barrelsAssigned: 1,
        barrelsDelivered: 0,
        barrelsPickedUp: 0,
        deliveredAt: null,
        lat: null,
        lng: null,
        deliveryPoint: { id: POINT_ID, name: 'Bar El Barril Feliz' },
        requirements: [{ id: 'req-001', routeStopId: STOP_ID, product: 'Lager', quantity: 1 }],
        barrels: [],
        alerts: [],
      },
    ],
  }
}
```

- [ ] **Step 3: Rewrite test 3 — route creation no longer touches barrels**

Find:

```ts
  // ── Step 3: Crear ruta → barril pasa a EN_ALISTAMIENTO ───────────────────
  it('3. POST /api/rutas — crea ruta y transiciona barriles a EN_ALISTAMIENTO', async () => {
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_BODEGA')])
    ;(prisma.route.create as jest.Mock).mockResolvedValueOnce(makeRoute('PLANIFICADA'))
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_ALISTAMIENTO'))

    const res = await request(app)
      .post('/api/rutas')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        name: 'Ruta Test',
        date: new Date().toISOString(),
        transportistId: 'trans-001',
        stops: [{ deliveryPointId: POINT_ID, position: 1, barrels: [{ barrelId: BARREL_ID, product: 'Lager' }] }],
      })

    expect(res.status).toBe(201)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_ALISTAMIENTO' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ALISTAMIENTO', toStatus: 'EN_ALISTAMIENTO' }) })
    )
  })
```

Replace with:

```ts
  // ── Step 3: Crear ruta con requerimientos por parada (no toca barriles) ──
  it('3. POST /api/rutas — crea ruta con requerimientos por parada', async () => {
    ;(prisma.route.create as jest.Mock).mockResolvedValueOnce(makeRoute('PLANIFICADA'))

    const res = await request(app)
      .post('/api/rutas')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        name: 'Ruta Test',
        date: new Date().toISOString(),
        transportistId: 'trans-001',
        stops: [{ deliveryPointId: POINT_ID, position: 1, requirements: [{ product: 'Lager', quantity: 1 }] }],
      })

    expect(res.status).toBe(201)
    expect(prisma.route.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Ruta Test',
          stops: expect.objectContaining({
            create: [
              expect.objectContaining({
                deliveryPointId: POINT_ID,
                position: 1,
                barrelsAssigned: 1,
                requirements: { create: [{ product: 'Lager', quantity: 1 }] },
              }),
            ],
          }),
        }),
      })
    )
  })
```

- [ ] **Step 4: Rewrite test 4 — iniciar ruta uses OPERARIO_BODEGA, not TRANSPORTISTA**

Find:

```ts
  // ── Step 4: Iniciar ruta → barril pasa a EN_TRANSPORTE ───────────────────
  it('4. POST /api/rutas/:id/iniciar — transiciona barriles a EN_TRANSPORTE', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('PLANIFICADA'))
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_ALISTAMIENTO')])
    ;(prisma.route.update as jest.Mock).mockResolvedValueOnce({ ...makeRoute('EN_CURSO'), departedAt: new Date() })
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_TRANSPORTE'))
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/iniciar`)
      .set('Authorization', `Bearer ${transportistaToken}`)

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_TRANSPORTE' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SALIDA_BODEGA', toStatus: 'EN_TRANSPORTE' }) })
    )
  })
```

Replace with:

```ts
  // ── Step 4: Iniciar ruta → barril pasa a EN_TRANSPORTE ───────────────────
  it('4. POST /api/rutas/:id/iniciar — transiciona barriles a EN_TRANSPORTE', async () => {
    ;(prisma.route.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeRoute('PLANIFICADA'))
      .mockResolvedValueOnce(makeRoute('EN_CURSO'))
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_BODEGA', { product: 'Lager' })])
    ;(prisma.route.update as jest.Mock).mockResolvedValueOnce({ ...makeRoute('EN_CURSO'), departedAt: new Date() })
    ;(prisma.routeBarrel.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 })
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_TRANSPORTE', { product: 'Lager' }))

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/iniciar`)
      .set('Authorization', `Bearer ${operarioToken}`)
      .send({ barrelIds: [BARREL_ID] })

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_TRANSPORTE' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SALIDA_BODEGA', toStatus: 'EN_TRANSPORTE' }) })
    )
  })
```

- [ ] **Step 5: Rewrite test 5 — entregar stop against the requirements model**

Find:

```ts
  // ── Step 5: Entregar stop → barril pasa a ENTREGADO ──────────────────────
  it('5. POST /api/rutas/:id/stops/:stopId/entregar — transiciona a ENTREGADO', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_TRANSPORTE')])
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('ENTREGADO'))
    ;(prisma.routeStop.update as jest.Mock).mockResolvedValueOnce({ id: STOP_ID, barrelsDelivered: 1, barrelsAssigned: 1 })
    ;(prisma.routeStop.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: STOP_ID, barrelsDelivered: 1, barrelsAssigned: 1 })
      .mockResolvedValueOnce({ id: STOP_ID, status: 'COMPLETADA', barrels: [] })

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/stops/${STOP_ID}/entregar`)
      .set('Authorization', `Bearer ${transportistaToken}`)
      .send({ barrelIds: [BARREL_ID], lat: 4.6097, lng: -74.0817 })

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ENTREGADO' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ENTREGA_LLENO', toStatus: 'ENTREGADO' }) })
    )
  })
```

Replace with:

```ts
  // ── Step 5: Entregar stop → barril pasa a ENTREGADO ──────────────────────
  it('5. POST /api/rutas/:id/stops/:stopId/entregar — transiciona a ENTREGADO', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))
    ;(prisma.routeBarrel.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'rb-001', routeId: ROUTE_ID, barrelId: BARREL_ID },
    ])
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('EN_TRANSPORTE', { product: 'Lager' })])
    ;(prisma.routeStopBarrel.count as jest.Mock).mockResolvedValueOnce(0)
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('ENTREGADO', { product: 'Lager' }))
    ;(prisma.routeStop.findUnique as jest.Mock).mockResolvedValueOnce({
      id: STOP_ID,
      barrelsDelivered: 1,
      requirements: [{ product: 'Lager', quantity: 1 }],
    })
    ;(prisma.routeStop.findMany as jest.Mock).mockResolvedValueOnce([{ status: 'COMPLETADA' }])
    ;(prisma.routeStop.findFirst as jest.Mock).mockResolvedValueOnce({
      id: STOP_ID,
      barrelsAssigned: 1,
      barrelsDelivered: 1,
      barrelsPickedUp: 0,
      requirements: [],
      barrels: [],
      deliveryPoint: {},
    })

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/stops/${STOP_ID}/entregar`)
      .set('Authorization', `Bearer ${transportistaToken}`)
      .send({ barrelIds: [BARREL_ID], lat: 4.6097, lng: -74.0817 })

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ENTREGADO' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ENTREGA_LLENO', toStatus: 'ENTREGADO' }) })
    )
  })
```

- [ ] **Step 6: Rewrite test 6 — recoger stop**

Find:

```ts
  // ── Step 6: Recoger vacío → barril pasa a EN_RECOGIDA ────────────────────
  it('6. POST /api/rutas/:id/stops/:stopId/recoger — transiciona a EN_RECOGIDA', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('ENTREGADO')])
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_RECOGIDA'))
    ;(prisma.routeStop.update as jest.Mock)
      .mockResolvedValueOnce({ id: STOP_ID })
      .mockResolvedValueOnce({ id: STOP_ID, barrels: [] })
    ;(prisma.routeStop.findUnique as jest.Mock).mockResolvedValueOnce({ id: STOP_ID, barrels: [] })

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/stops/${STOP_ID}/recoger`)
      .set('Authorization', `Bearer ${transportistaToken}`)
      .send({ barrelIds: [BARREL_ID] })

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_RECOGIDA' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RECOGIDA_VACIO', toStatus: 'EN_RECOGIDA' }) })
    )
  })
```

Replace with:

```ts
  // ── Step 6: Recoger vacío → barril pasa a EN_RECOGIDA ────────────────────
  it('6. POST /api/rutas/:id/stops/:stopId/recoger — transiciona a EN_RECOGIDA', async () => {
    ;(prisma.route.findUnique as jest.Mock).mockResolvedValueOnce(makeRoute('EN_CURSO'))
    ;(prisma.barrel.findMany as jest.Mock).mockResolvedValueOnce([makeBarrel('ENTREGADO', { product: 'Lager' })])
    ;(prisma.barrel.update as jest.Mock).mockResolvedValueOnce(makeBarrel('EN_RECOGIDA', { product: 'Lager' }))
    ;(prisma.routeStopBarrel.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 })
    ;(prisma.routeStop.findFirst as jest.Mock).mockResolvedValueOnce({
      id: STOP_ID,
      barrelsAssigned: 1,
      barrelsDelivered: 1,
      barrelsPickedUp: 1,
      requirements: [],
      barrels: [],
      deliveryPoint: {},
    })

    const res = await request(app)
      .post(`/api/rutas/${ROUTE_ID}/stops/${STOP_ID}/recoger`)
      .set('Authorization', `Bearer ${transportistaToken}`)
      .send({ barrelIds: [BARREL_ID] })

    expect(res.status).toBe(200)
    expect(prisma.barrel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EN_RECOGIDA' } })
    )
    expect(prisma.barrelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RECOGIDA_VACIO', toStatus: 'EN_RECOGIDA' }) })
    )
  })
```

Test 7 (`cerrar`) needs no body changes — it only needed the `auditLog.create` default added in Step 1.

- [ ] **Step 7: Run the full file**

```bash
cd apps/api && npx jest --config jest.config.js src/__tests__/barriles.integration.test.ts
```

Expected: all 16 tests PASS (the original 15, plus the 1 new one added in Task 2 Step 4; 2 others were renamed in place, not added) — zero failures.

- [ ] **Step 8: Run the entire backend suite**

```bash
cd apps/api && npx jest --config jest.config.js
```

Expected: `Test Suites: 5 passed, 5 total`, zero failures.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/__tests__/barriles.integration.test.ts
git commit -m "test(api): fix pre-existing broken rutas/mantenimiento tests (stale fixtures)"
```

---

## Final verification

- [ ] **Step 1: Full backend suite green**

```bash
cd apps/api && npx jest --config jest.config.js
```

Expected: 0 failures across all 5 suites.

- [ ] **Step 2: Backend type-check**

```bash
pnpm --filter api run type-check
```

Expected: no errors.

- [ ] **Step 3: Web type-check**

```bash
pnpm --filter web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual end-to-end walkthrough**

With `pnpm dev` running and the DB seeded (Task 5):
1. Log in as `produccion1@bbc.co` — land on a role-restricted sidebar (Llenado, Barriles only).
2. On `/llenado`, pick a product, enter a lote code, scan/select 2-3 `EN_BODEGA` barrels, confirm — see them disappear from the "en bodega sin producto" view and the lote show up in history.
3. Log in as `admin@bbc.co`, open `/barriles`, confirm the filled barrels now show the assigned product.
4. Use the existing recepción flow (mobile or `POST /api/barriles/:id/recibir` via curl/Postman) on one of those barrels after moving it through the flow to `EN_RECOGIDA` — confirm `product` clears back to `—` in `/barriles` while the barrel's detail page timeline (`BarrelTimeline`) still shows the `LLENADO` and `RETORNO_BODEGA` events with the product name preserved.
