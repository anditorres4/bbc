# BBC Barrel Track — Estado del Sistema

> Última actualización: 2026-05-16 | Commit: `a9ee2d2`

---

## Backend (`apps/api`)

### Autenticación
- [x] `POST /auth/login` — devuelve accessToken (15 min) + refreshToken (7 días) + user
- [x] `POST /auth/refresh` — renueva accessToken con cookie refreshToken
- [x] `POST /auth/logout` — revoca refreshToken en DB
- [x] `GET /auth/me` — usuario autenticado actual
- [x] `POST /auth/change-password` — cambia contraseña y revoca todos los refreshTokens
- [x] Middleware `authenticate` — valida JWT Bearer, adjunta `req.user`
- [x] Middleware `authorize(...roles)` — control de acceso por rol

### Barriles
- [x] `POST /api/barriles/scan` — registra o devuelve barril por qrCode; retorna últimos 5 eventos
- [x] `GET /api/barriles` — listado paginado con filtros (status, product, search)
- [x] `GET /api/barriles/:id` — detalle con hoja de vida completa
- [x] `PATCH /api/barriles/:id` — editar datos del barril (ADMIN/SUPERVISOR)
- [x] `GET /api/barriles/:id/qr` — imagen QR en base64
- [x] `POST /api/barriles/:id/alistamiento` — barril pasa a EN_ALISTAMIENTO
- [x] `POST /api/barriles/:id/recibir` — barril regresa a EN_BODEGA
  - [x] **Auto-cierre de ruta**: si todos los vacíos recogidos de una ruta han retornado, la ruta se cierra como COMPLETADA automáticamente
- [x] Máquina de estados — transiciones permitidas validadas en `barrelStateMachine.ts`
- [x] Hoja de vida (`BarrelEvent`) — append-only, nunca se modifica

### Rutas
- [x] `GET /api/rutas` — listado con filtros (status, transportistId, date, page)
- [x] `POST /api/rutas` — crear ruta con paradas y requerimientos (ADMIN/SUPERVISOR)
- [x] `GET /api/rutas/:id` — detalle con paradas y barriles
- [x] `PATCH /api/rutas/:id/iniciar` — ruta pasa a EN_CURSO, barriles a EN_TRANSPORTE
- [x] `PATCH /api/rutas/:id/cancelar` — cancela ruta
- [x] `GET /api/rutas/transportista/:id` — rutas del día por transportista

### Paradas (RouteStop)
- [x] `POST /api/rutas/:id/paradas/:stopId/entregar` — registra entrega de barril lleno (GPS, foto)
- [x] `POST /api/rutas/:id/paradas/:stopId/recoger-vacio` — registra recogida de barril vacío
- [x] `POST /api/rutas/:id/paradas/:stopId/novedad` — registra novedad en parada

### Puntos de Entrega
- [x] `GET /api/puntos-entrega` — listado activos
- [x] `POST /api/puntos-entrega` — crear (ADMIN/SUPERVISOR)
- [x] `PATCH /api/puntos-entrega/:id` — editar

### Usuarios
- [x] `GET /api/usuarios` — listado (ADMIN/SUPERVISOR)
- [x] `POST /api/usuarios` — crear (ADMIN)
- [x] `PATCH /api/usuarios/:id` — editar (ADMIN)

### Alertas
- [x] `GET /api/alertas` — listado con filtros (severity, isRead, targetRole)
- [x] `PATCH /api/alertas/:id/leer` — marcar leída
- [x] `POST /api/alertas/leer-todas` — marcar todas leídas
- [x] `GET /api/alertas/stream` — SSE (acepta `?token=` — EventSource no soporta headers)
- [x] Job diario (`dailyAlerts.ts`) — 4 checks automáticos:
  - Barriles sin movimiento 60+ días
  - Barriles próximos a mantenimiento (11+ meses)
  - Barriles fin de vida útil
  - Rutas sin cerrar 24+ horas

### Reportes
- [x] `GET /api/reportes` — dashboard pre-agregado (ADMIN/SUPERVISOR)
  - `barrilesXEstado` — conteo por BarrelStatus
  - `barrilesXProducto` — top 10 productos
  - `rutasPorDia` — últimos 30 días (total, completadas, canceladas, conNovedad)
  - `topPuntosEntrega` — entregas + recogidas por punto
  - `alertasPorSeveridad` — últimos 30 días
  - `summary` — totalBarrels, activeRoutes, unreadAlerts, sinMovimiento60d

### Tests
- [x] 27/27 tests de autenticación — sin base de datos (Prisma mockeado)

---

## Web Admin (`apps/web`)

### Autenticación
- [x] `/login` — login con email/password
- [x] Tokens en httpOnly cookies (SameSite=strict)
- [x] Refresh automático silencioso
- [x] Redirección al login si token expira

### Dashboard
- [x] `/dashboard` — KPIs: barriles activos, rutas del día, alertas no leídas, barriles sin movimiento
- [x] Rutas del día con estado visual
- [x] Barriles por estado (chart)

### Barriles
- [x] `/barriles` — tabla paginada con filtros (status, product, search)
- [x] Detalle de barril — hoja de vida completa con línea de tiempo
- [x] Edición de barril (ADMIN/SUPERVISOR)
- [x] QR display con descarga PNG y botón imprimir etiqueta
- [x] Selección múltiple → "Generar etiquetas (N)"
- [x] `/barriles/etiquetas?ids=BBC-001,...` — grilla de etiquetas para impresión (3 col, 8cm×8cm)

### Rutas
- [x] `/rutas` — listado con filtros; vista de paradas y estado
- [x] Crear ruta — formulario con paradas, requerimientos y transportista
- [x] Detalle de ruta — progreso de entrega por parada

### Puntos de Entrega
- [x] `/puntos-entrega` — CRUD completo

### Usuarios
- [x] `/usuarios` — CRUD completo (ADMIN)

### Alertas
- [x] `/alertas` — lista con filtros (severity, leídas); bulk "marcar todas leídas"
- [x] `AlertBell` — campana en header con contador, popover 5 más recientes, badge
- [x] SSE en tiempo real: `EventSource → /api/alertas/stream?token=...` invalida caché TanStack Query

### Reportes
- [x] `/reportes` — 6 secciones:
  1. Cards de KPIs (4 métricas clave)
  2. Barriles por estado (barras horizontales con colores por status)
  3. Barriles por producto (barras horizontales)
  4. Rutas últimos 14 días (mini gráfico; verde=completadas/total)
  5. Puntos de entrega (entregas + recogidas por punto)
  6. Alertas por severidad (badges coloridos)
- [x] Acceso: solo ADMIN y SUPERVISOR
- [x] `staleTime: 60s` vía TanStack Query

### Navegación
- [x] `AdminSidebar` — links: Dashboard, Barriles, Rutas, Puntos de Entrega, Usuarios, Alertas, **Reportes**
- [x] `AdminHeader` — título dinámico por ruta, AlertBell, usuario
- [x] SSE conectado en layout raíz `(admin)/layout.tsx`

---

## App Móvil (`apps/mobile`)

### Autenticación
- [x] Login → tokens en SecureStore (native) / localStorage (web)
- [x] Refresh automático con interceptor de 401
- [x] Role routing: OPERARIO_BODEGA → `/(bodega)`, TRANSPORTISTA → `/(transportista)`
- [x] Logout — `POST /auth/logout` + `clearTokens()` + redirect a login
- [x] Cold start — verifica token almacenado y redirige al rol correcto

### Operario de Bodega

#### Tabs
- [x] **Inicio** (`(bodega)/index.tsx`) — dashboard 2×2: barriles en bodega, rutas activas, alertas, sin movimiento; LogOut en header
- [x] **Escanear** (`(bodega)/escanear.tsx`) — QR scan informativo; muestra card con ID, estado, producto y últimos 3 eventos del barril (hoja de vida resumida)
- [x] **Recepción** (`(bodega)/recepcion.tsx`) — escaneo de barriles que retornan; lista de sesión; auto-cierre de ruta si todos los vacíos recogidos retornaron
- [x] **Alertas** (`(bodega)/alertas.tsx`) — FlashList por severidad; tap para marcar leída; auto-refresh con `useFocusEffect`
- [x] **Alistamiento** (`(bodega)/alistamiento/`) — lista rutas PLANIFICADA + EN_CURSO; escaneo continuo por producto; "Confirmar Salida" inicia la ruta

#### Alistamiento (detalle)
- [x] `autoConfirm={true}` — scanner permanece abierto entre escaneos
- [x] Ruta completada → regresa solo cuando todos los requerimientos están cubiertos
- [x] Rutas ya alistadas aparecen como tarjetas verdes deshabilitadas (badge "Alistada")
- [x] Feedback visual + haptics en cada escaneo correcto
- [x] `useFocusEffect` — lista se refresca al volver de la pantalla de detalle

### Transportista

#### Tabs
- [x] **Mi Ruta** (`(transportista)/index.tsx`) — ruta del día; INICIAR abre modal de confirmación; lista de paradas con estado; llama `/auth/me` para obtener CUID real
- [x] **Escanear** (`(transportista)/escanear.tsx`) — QR scan informativo; card con ID, estado, producto y últimos 3 eventos (hoja de vida resumida)
- [x] **Alertas** (`(transportista)/alertas.tsx`) — mismo patrón que bodega

#### Mi Ruta — Detalle de Parada (`parada/[stopId].tsx`)
> No es un tab — se accede programáticamente; oculto en tab bar con `href: null`

- [x] GPS — `expo-location`; enviado con cada entrega/recogida
- [x] **Escaneo de entrega** — `autoConfirm={true}`: permanece abierto entre escaneos; feedback verde 1.5s; rechazo mostrado dentro del scanner (no toast en pantalla padres)
- [x] Auto-cierre del modal 1.6s después de que todos los barriles requeridos están entregados
- [x] **Escaneo de recogida** — flujo estándar con confirm-sheet (el transportista puede recoger los que haya)
- [x] Novedad — formulario de texto libre
- [x] Optimistic update offline: barril marcado ENTREGADO localmente si la request se encola

#### SSE + Alertas en tiempo real
- [x] Layout conecta SSE via `response.body.getReader()`; fallback a polling 30s si `res.body === null` (RN 0.74)
- [x] Banner rojo animado desde top para alertas CRITICAL (haptics + auto-dismiss 5s)
- [x] Poll 30s para badge de alertas no leídas (`tabBarBadge`)

### Modo Offline
- [x] `offlineQueue.ts` / `offlineQueue.web.ts` — cola persistente: MMKV (native) / localStorage (web)
- [x] `apiWithOffline.ts` — detecta conectividad con NetInfo antes de cada llamada mutante; encola si offline
- [x] `useNetworkStatus.ts` — drena la cola al reconectar; reporta `isSyncing`, `pendingCount`, `errorCount`
- [x] `NetworkStatusBar.tsx` — barra 28px sticky: rojo=sin conexión, naranja=sincronizando, amarillo=errores; tap en amarillo limpia errores
- [x] Reglas de reintento: 4xx → `moveToErrors`; error de red → incrementa intentos; ≥3 intentos → `moveToErrors`

### QR Scanner (`QRScanner.tsx`)
- [x] Formato `BBC-\d{3,5}` validado antes de cualquier llamada API
- [x] Web: `getUserMedia` + jsQR (canvas) — funciona en cualquier navegador
- [x] Native: `expo-camera` `CameraView`
- [x] `autoConfirm` prop — confirma automáticamente, muestra banner verde 1.5s, resetea `lastScanRef` en fallo/rechazo para retry inmediato
- [x] `onResult: (result, action) => string | void` — `string` = rechazo (mostrado en scanner); `void` = éxito

### Módulos de plataforma dual
- [x] `auth.ts` / `auth.web.ts` — SecureStore (native) / localStorage (web)
- [x] `offlineQueue.ts` / `offlineQueue.web.ts` — MMKV (native) / localStorage (web)

---

## Infraestructura

### Docker (local)
- [x] PostgreSQL 16 en puerto 5432
- [x] pgAdmin 4 en puerto 5050
- [x] `docker-compose.yml` con `.env`

### Railway (producción)
- [x] API: `https://bbc-production-62ef.up.railway.app`
- [x] Start command: `pnpm --filter api run start:prod` (generate + migrate + node)
- [x] CORS: wildcard `https://*.vercel.app` + orígenes explícitos; SameSite=None para cookies cross-domain
- [x] Variables: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`

### Vercel (web)
- [x] `apps/web` desplegado en Vercel (Next.js 14)
- [x] `NEXT_PUBLIC_API_URL=https://bbc-production-62ef.up.railway.app`

### Expo (móvil)
- [x] `expo.web.output = "single"` — SPA pura, sin SSR
- [x] `metro.config.js` con `watchFolders` y `nodeModulesPaths` para pnpm symlinks

### Seed
- [x] `db:seed` — usuarios + puntos de entrega base (emails `@bbc.co`)
- [x] `db:seed-demo` — 20 barriles + 2 rutas del día + hoja de vida + alertas (emails `@bbc.com`)

---

## Pendientes / Backlog

- [ ] Página de detalle de ruta en web — mostrar requerimientos y progreso de entrega por parada
- [ ] Alistamiento en móvil — escaneo por producto/cantidad (actualmente es por ID de barril)
- [ ] Push notifications (Expo) como alternativa/complemento a SSE en móvil
- [ ] Tests de integración para módulos de rutas y barriles
- [ ] Filtro de fechas en `/reportes`
