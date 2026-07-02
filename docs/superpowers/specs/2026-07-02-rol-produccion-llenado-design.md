# BBC Barrel Track — Rol Producción: Llenado de Barriles
**Date:** 2026-07-02
**Scope:** `apps/api/` (nuevo rol, modelos, endpoints), `apps/web/` (pantalla `/llenado`, admin `/productos`)
**Target:** Next.js 14 App Router, Express + Prisma 6, mismo stack existente

---

## 1. Contexto y objetivo

Cuando un barril vuelve vacío a bodega (`EN_RECOGIDA → EN_BODEGA`), el equipo de **producción** lo lava y lo llena con un nuevo producto. Hoy ese paso no existe como flujo: el campo `Barrel.product` se edita ad-hoc vía `PATCH /api/barriles/:id`, no hay rol dedicado, no queda registro de lote/fecha de envasado, y `recibirBarril` no limpia `product` al volver el barril vacío (arrastra el producto anterior indefinidamente).

Este documento define un rol web nuevo (`PRODUCCION`) con una pantalla dedicada para asignar producto + lote a barriles de forma rápida (lector USB o selección manual), y ajusta el ciclo de vida del barril para que el contenido se limpie al volver vacío sin perder trazabilidad histórica.

---

## 2. Modelo de datos

### Nuevos modelos

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
  code        String                    // código de lote, texto libre, NO único a nivel DB
  productId   String
  fillDate    DateTime                  // fecha de envasado, editable, default = hoy
  notes       String?
  createdById String
  createdAt   DateTime @default(now())

  product     Product        @relation(fields: [productId], references: [id])
  createdBy   User           @relation(fields: [createdById], references: [id])
  barrels     Barrel[]       @relation("BarrelCurrentBatch")
  events      BarrelEvent[]
}
```

### Cambios a modelos existentes

| Modelo | Cambio |
|---|---|
| `Role` | + `PRODUCCION` |
| `EventType` | + `LLENADO` (no cambia `status`: `fromStatus === toStatus`) |
| `Barrel` | + `currentBatchId String?` y relación `currentBatch` → `ProductionBatch`. `product String?` **se mantiene sin cambios de tipo** (sigue siendo texto libre, poblado con `Product.name` al asignar) para no romper la lógica existente que compara productos por string (`RouteStopRequirement.product`, `RouteStopBarrel.product`, agregaciones en reportes, alistamiento móvil). |
| `BarrelEvent` | + `product String?` y `batchId String?` (+ relación a `ProductionBatch`) — foto del producto/lote vigente en el momento del evento, para que la trazabilidad sobreviva aunque `Barrel.product` se limpie después. |

### Trazabilidad al vaciar

En `recibirBarril` (`POST /api/barriles/:id/recibir`, transición `EN_RECOGIDA → EN_BODEGA`):
1. Antes de actualizar, se lee `barrel.product` y `barrel.currentBatchId` actuales.
2. Se crean el evento `RETORNO_BODEGA` con esos valores copiados en `product`/`batchId` (foto del contenido que traía el barril al llegar).
3. Se actualiza el barril con `status: EN_BODEGA, product: null, currentBatchId: null`.

El historial completo (qué producto/lote tuvo el barril y cuándo) queda íntegro en `BarrelEvent` — solo se resetea el estado *actual* del barril.

---

## 3. Reglas de negocio (`lotes.service.ts`)

Ninguna regla bloquea al operador — todas siguen el patrón ya usado en `validateTransition` (permitir + advertir + alertar a SUPERVISOR/ADMIN):

1. **Estado del barril:** se espera `EN_BODEGA`, pero si está en otro estado se permite igual — se marca `irregular: true`, se agrega un `warning` en la respuesta y se dispara una alerta (reusa `fireIrregularAlert`).
2. **Producto ya asignado:** si el barril ya tenía `product` (no fue vaciado/recibido correctamente antes de re-llenarse), se permite reemplazarlo — `warning` + alerta.
3. **Código de lote duplicado:** si ya existe un `ProductionBatch.code` igual (case-insensitive), se permite crear igual — `warning: "Código de lote ya utilizado el DD/MM/AAAA en producto X"`.
4. **Atomicidad:** `POST /api/lotes` crea el `ProductionBatch`, actualiza todos los barriles del payload (`product`, `currentBatchId`) y crea un evento `LLENADO` por barril, todo dentro de una transacción Prisma (`prisma.$transaction`) — o todo se aplica, o nada.

---

## 4. API

### Nuevos endpoints

```
GET   /api/productos                    authenticate
      ?isActive=true (default)          → lista para el picker

POST  /api/productos                    authorize(SUPERVISOR, ADMIN)
      body: { name, defaultCapacity? }

PATCH /api/productos/:id                authorize(SUPERVISOR, ADMIN)
      body: { name?, defaultCapacity?, isActive? }

POST  /api/lotes                        authorize(PRODUCCION, SUPERVISOR, ADMIN)
      body: { productId, code, fillDate, barrelIds: string[], notes? }
      → { data: lote, warnings: string[] }

GET   /api/lotes                        authenticate
      ?mine=true                        → filtra por createdById (usado en historial de /llenado)

GET   /api/lotes/:id                    authenticate
      → detalle con barriles incluidos
```

### Endpoint modificado

- `POST /api/barriles/:id/recibir` — agrega la limpieza de `product`/`currentBatchId` descrita en §2, preservando el resto del comportamiento actual (incluido el auto-cierre de ruta).

---

## 5. Interfaz web

### Rol y navegación (`AdminSidebar`)

- Nuevo ítem **"Llenado"** (`/llenado`) visible para `PRODUCCION`, `SUPERVISOR`, `ADMIN`.
- Para `role === 'PRODUCCION'`, el sidebar solo muestra **Llenado** y **Barriles** — el resto de ítems (Dashboard, Rutas, Puntos de Entrega, Alertas, Usuarios, Mantenimiento, Reportes, Auditoría) se ocultan.
- `AdminLayoutInner` ya obtiene `user` vía `/auth/me`; se le pasa `role` a `AdminSidebar` para filtrar, y se agrega un guard: si `role === 'PRODUCCION'` y la ruta actual no es `/llenado` ni `/barriles*`, redirige a `/llenado`.
- El resto de los roles no cambia su comportamiento actual (nav completo, sin guard nuevo).

### Página `/llenado`

1. **Formulario de lote** (card superior): grid de botones grandes con los productos activos (selección de 1 click, no dropdown) + input de código de lote + fecha de envasado (default hoy, editable). Debe completarse antes de poder agregar barriles.
2. **Captura de barriles** — dos modos simultáneos:
   - Input siempre enfocado para lector USB de código de barras (Enter agrega a la lista) — mismo patrón que el `Input` con `autoFocus` del diálogo de escaneo en `/barriles`.
   - Grid/lista con checkboxes de barriles `EN_BODEGA` (buscable por ID), para selección manual. Barriles que ya tienen `product` muestran un badge de advertencia.
3. **Lista acumulada** del lote en curso: barril + advertencia inline si aplica, con botón para quitar antes de confirmar (mismo patrón que `handleDeshacerAlistamiento` en móvil).
4. **Confirmar lote** → `POST /api/lotes`; muestra los `warnings` devueltos como toast; limpia la lista de barriles pero conserva producto/código si se sigue llenando el mismo lote.
5. **Historial del día**: lotes creados hoy por el usuario actual (`GET /api/lotes?mine=true`), con cantidad de barriles por lote.

### Página `/productos` (nueva)

- Visible en sidebar solo para `SUPERVISOR`/`ADMIN`.
- Mismo patrón que `/barriles`: `DataTable` + `Dialog` con `react-hook-form` para crear/editar (nombre, capacidad default, activo/inactivo).

### Seed

- Nuevo usuario `produccion1@bbc.co` / `BBC2026!`, rol `PRODUCCION`.
- Los 8 productos ya usados en `seed-demo.ts` (Monserrate Negra, Monserrate Roja, Chapinero Porter, Palo Santo, BBC IPA, Cajicá Honey, Taberna Pale Ale, Andina Stout) se cargan como registros reales de `Product` en el seed base (`seed.ts`), con su capacidad asociada como `defaultCapacity`.

---

## 6. Fuera de alcance de esta iteración

- Cambios a `/reportes` para mostrar métricas de lotes/producción (queda como mejora futura).
- Escaneo por cámara en web (se usa lector USB + selección manual).
- Endpoint de "deshacer lote" después de confirmado — corregir un error se hace re-llenando el barril (regla de negocio §3.2 ya lo permite con advertencia).
- Relación FK entre `Barrel.product` (string) y `Product` — se mantiene el campo de texto libre por compatibilidad con el resto del sistema.
- Enforcement de capacidad (barril vs `Product.defaultCapacity`) — es solo informativo en el picker.
- Restringir a otros roles (`OPERARIO_BODEGA`, `TRANSPORTISTA`) la navegación web fuera de su alcance — no se toca el comportamiento actual de esos roles.
