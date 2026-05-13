# BBC Barrel Track — CLAUDE.md

## Visión del Proyecto
Sistema de trazabilidad de barriles para la empresa BBC (craft brewery).
Permite rastrear el ciclo de vida completo de cada barril mediante códigos QR grabados en el activo.

## Flujo Operativo
```
Bodega → Alistamiento → Transporte → Entrega (lleno) → Recogida (vacío) → Bodega
```

- El **contenido** (sabor/producto) se asigna en el paso de **Alistamiento**
- El barril se identifica por QR grabado físicamente en el activo (no cambia)
- Los eventos de movimiento se registran escaneando el QR en cada etapa

## Escala
| Fase | Barriles | Sedes | Rutas | Usuarios simultáneos |
|------|----------|-------|-------|----------------------|
| Piloto | 100 | 1 | 1 | ~7 |
| Objetivo | 16.000 | múltiples | 50+ | - |

## Stack Tecnológico

### Backend (`apps/api`)
- Node.js 20 + Express + TypeScript
- PostgreSQL 16 + Prisma ORM 6.x (config via `prisma.config.ts`)
- JWT auth: access token 15 min + refresh token 7 días
- Server-Sent Events (SSE) para alertas en tiempo real

### Web (`apps/web`)
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Auth: JWT en httpOnly cookies

### Móvil (`apps/mobile`)
- React Native + Expo SDK 51 + Expo Router + TypeScript
- Auth: JWT en SecureStore
- Offline: MMKV + cola de sincronización

### Paquetes Compartidos
- `packages/types` — tipos TypeScript compartidos (barrel, user, events, etc.)
- `packages/utils` — helpers compartidos (QR parsing, estados de barril, fechas)

## Estructura de Carpetas
```
bbc/
  apps/
    api/
      prisma/
        schema.prisma           ← fuente de verdad del modelo de datos
        prisma.config.ts        ← config Prisma (schema, seed)
        migrations/
          20250512000000_init/  ← migración inicial (incluye CREATE SEQUENCE)
      src/
        db/
          client.ts             ← singleton PrismaClient
          seed.ts               ← seed: usuarios + puntos de entrega
        index.ts                ← Express entry point
    web/           Next.js 14 frontend
    mobile/        Expo React Native app
  packages/
    types/         Tipos TS compartidos
    utils/         Helpers compartidos
  docker-compose.yml
  turbo.json
  package.json
  pnpm-workspace.yaml
  .env / .env.example
```

## Infraestructura Local (Docker)
- PostgreSQL 16 en puerto 5432
- pgAdmin 4 en puerto 5050
- Variables de entorno en `.env` (basado en `.env.example`)

## Modelos de Datos (Prisma)

### Enums
| Enum | Valores |
|------|---------|
| `BarrelStatus` | EN_BODEGA, EN_ALISTAMIENTO, EN_TRANSPORTE, ENTREGADO, EN_RECOGIDA, DEVUELTO, BAJA |
| `EventType` | REGISTRO, ALISTAMIENTO, SALIDA_BODEGA, LLEGADA_PUNTO, ENTREGA_LLENO, RECOGIDA_VACIO, RETORNO_BODEGA, ENVIO_MANTENIMIENTO, RETORNO_MANTENIMIENTO, DISPOSICION_FINAL, NOVEDAD |
| `Role` | ADMIN, SUPERVISOR, OPERARIO_BODEGA, TRANSPORTISTA |
| `RouteStatus` | PLANIFICADA, EN_CURSO, COMPLETADA, CON_NOVEDAD, CANCELADA |
| `StopStatus` | PENDIENTE, COMPLETADA, CON_NOVEDAD, CANCELADA |
| `BarrelStopStatus` | ASIGNADO, ENTREGADO, RECOGIDO_VACIO, NOVEDAD |
| `AlertType` | SIN_MOVIMIENTO_60_DIAS, NOVEDAD_EN_RUTA, BARRIL_PROXIMO_MANTENIMIENTO, BARRIL_FIN_VIDA_UTIL, RUTA_SIN_CERRAR |
| `AlertSeverity` | INFO, WARNING, CRITICAL |

### Modelos y relaciones clave
```
User ──────────────── crea ──────────────── Barrel (id: BBC-001, BBC-002...)
  │                                            │
  ├── transporta ──── Route ──── stops ──── RouteStop ──── RouteStopBarrel ──── Barrel
  │                     │
  └── lee ──────────── Alert

BarrelEvent (append-only, NUNCA borrar ni editar)
  └── barrelId, userId, routeId?, deliveryPointId?
      fromStatus → toStatus (hoja de vida completa del barril)
```

### Reglas de negocio en DB
- `Barrel.id` se genera automáticamente con `barrel_id_seq` (PostgreSQL sequence)
  → Formato `BBC-001`, `BBC-002`, ..., `BBC-999`, `BBC-1000`
- `BarrelEvent` es append-only: la API NUNCA debe ejecutar UPDATE o DELETE sobre esta tabla
- Un barril solo puede estar en UN estado (forzado por la máquina de estados en la API)
- `RouteStop.position` es único por ruta (`@@unique([routeId, position])`)
- `RouteStopBarrel` es único por stop+barril (`@@unique([routeStopId, barrelId])`)
- `Alert.targetRoles` es un array PostgreSQL nativo de enum (`Role[]`)

## Sistema de Autenticación

### Archivos
```
apps/api/src/
  app.ts                    ← Express app (exportada, sin listen — para tests)
  index.ts                  ← solo llama app.listen()
  auth/
    auth.types.ts           ← AuthError(message, status)
    auth.service.ts         ← login / refresh / logout / changePassword
    auth.router.ts          ← POST /login · /refresh · /logout · /change-password
                               GET  /me
  middleware/
    authenticate.ts         ← valida JWT Bearer — adjunta req.user: {id, role}
    authorize.ts            ← authorize(...roles) — verifica req.user.role
  __tests__/
    setup.ts                ← JWT_SECRET etc. para tests sin DB
    auth.test.ts            ← 27 tests con supertest + mocks de Prisma
```

### Endpoints
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /auth/login | — | Devuelve accessToken + refreshToken + user |
| POST | /auth/refresh | — | Nuevo accessToken desde refreshToken |
| POST | /auth/logout | — | Revoca refreshToken en DB |
| GET | /auth/me | Bearer | Usuario autenticado |
| POST | /auth/change-password | Bearer | Cambia password y revoca todos los RT |

### Tokens
- **Access token**: JWT 15 min, firmado con `JWT_SECRET`, payload `{sub, role}`
- **Refresh token**: hex 128 chars, guardado en tabla `RefreshToken` (DB), 7 días
- **Web**: access en memoria + refresh en httpOnly cookie `bbc_refresh` (SameSite=strict)
- **Móvil**: ambos en el body JSON → guardar en SecureStore

### Uso del middleware
```typescript
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { Role } from '@prisma/client'

router.get('/ruta', authenticate, handler)                           // solo autenticado
router.delete('/ruta', authenticate, authorize(Role.ADMIN), handler) // solo ADMIN
router.post('/ruta', authenticate, authorize(Role.ADMIN, Role.SUPERVISOR), handler)
```

### Tests — 27/27 verde (sin base de datos)
```
pnpm --filter api run test
```
Prisma se mockea completamente — los tests son independientes de la DB.

## Seed Inicial
Archivo: `apps/api/src/db/seed.ts`

| Rol | Email | Password |
|-----|-------|----------|
| ADMIN | admin@bbc.co | Bbc2024! |
| SUPERVISOR | supervisor@bbc.co | Bbc2024! |
| OPERARIO_BODEGA | operario1@bbc.co | Bbc2024! |
| OPERARIO_BODEGA | operario2@bbc.co | Bbc2024! |
| TRANSPORTISTA | trans1@bbc.co | Bbc2024! |
| TRANSPORTISTA | trans2@bbc.co | Bbc2024! |
| TRANSPORTISTA | trans3@bbc.co | Bbc2024! |

Puntos de entrega: Bar El Barril Feliz, Restaurante La Cervecería, Pub The Hop Garden.
**Los barriles NO se seedean** — se registran escaneando el QR físico.

## Comandos Útiles
```bash
# Desarrollo
pnpm dev              # Arranca api:4000 + web:3000 + mobile:8081 (Turborepo)
pnpm build            # Build de todos los paquetes
pnpm lint             # Lint de todos los workspaces

# Base de datos (requiere Docker corriendo)
docker compose up -d      # Levanta PostgreSQL 5432 + pgAdmin 5050
pnpm db:migrate           # prisma migrate dev (desde raíz)
pnpm db:generate          # prisma generate (regenera client)
pnpm db:studio            # Abre Prisma Studio
pnpm db:seed              # Carga usuarios y puntos de entrega iniciales

# Migración inicial (primera vez)
docker compose up -d
pnpm --filter api prisma migrate dev --name init
pnpm --filter api prisma db seed
```

## Variables de Entorno Clave
Ver `.env.example` para la lista completa. Las mínimas para desarrollo:
- `DATABASE_URL` — conexión a PostgreSQL
- `JWT_SECRET` — secreto para firmar access tokens
- `JWT_REFRESH_SECRET` — secreto para refresh tokens

## Notas de Arquitectura
- El monorepo usa **Turborepo** para cacheo de builds y ejecución en paralelo
- La app móvil implementa **offline-first**: los escaneos se encolan en MMKV y se sincronizan cuando hay conexión
- Las alertas en tiempo real (barril perdido, entrega tardía) se envían vía **SSE** desde el API
- Prisma genera los tipos de base de datos; los tipos de dominio adicionales viven en `packages/types`
- `prisma.config.ts` reemplaza el campo `"prisma"` en `package.json` (deprecado en Prisma 7)
