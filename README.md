# BBC Barrel Track

Sistema de trazabilidad de barriles para BBC (craft brewery). Rastrea el ciclo de vida completo de cada barril mediante códigos QR.

## Prerequisitos

- Node.js 20+
- pnpm 8+
- PostgreSQL 16 (Docker Desktop **o** instalación nativa desde [postgresql.org](https://www.postgresql.org/download/))
- Expo Go app en el dispositivo físico para la demo

## Instalacion rapida

```bash
pnpm install

# Con Docker:
docker compose up -d

# Con PostgreSQL nativo (ya corriendo en puerto 5432):
# Crear la base de datos: createdb bbc_barrel_track (o desde pgAdmin)

pnpm db:migrate
pnpm --filter api run db:seed-demo
pnpm run dev
```

## URLs

| Servicio | URL |
|----------|-----|
| API REST | http://localhost:4000/api |
| Web Admin | http://localhost:3000 |
| App Movil | ver sección Expo abajo |

## Credenciales de demo (contraseña: `BBC2026!`)

| Rol | Email |
|-----|-------|
| Admin | admin@bbc.com |
| Supervisor | supervisor@bbc.com |
| Operario Bodega | bodega1@bbc.com |
| Operario Bodega | bodega2@bbc.com |
| Transportista | trans1@bbc.com |
| Transportista | trans2@bbc.com |
| Transportista | trans3@bbc.com |

## Demo seed

El seed de demo crea:
- **20 barriles** (BBC-001 a BBC-020) con productos y estados variados
- **Ruta Norte - Demo** programada para mañana, asignada a Pedro Trans (trans1@bbc.com)
- **4 alertas pre-existentes** de mantenimiento y vida útil
- **5 puntos de entrega** en Bogotá

```bash
# Reset completo + seed de demo
pnpm --filter api prisma migrate reset --force
pnpm --filter api run db:seed-demo

# Solo seed (si las tablas ya existen y están vacías)
pnpm --filter api run db:seed-demo
```

## App Movil — Expo

### Simulador / emulador

```bash
pnpm --filter mobile expo start
```

### Dispositivo físico en red local

```bash
# 1. Obtener IP local (Windows)
ipconfig | findstr IPv4

# 2. Actualizar apps/mobile/.env
#    EXPO_PUBLIC_API_URL=http://<TU_IP_LOCAL>:4000

# 3. Iniciar Expo en modo LAN
pnpm --filter mobile expo start

# Escanear el QR con Expo Go (Android) o la cámara (iOS)
```

### Dispositivo físico con tunnel (sin LAN compartida)

```bash
# Instalar ngrok globalmente (solo una vez)
npm install -g @expo/ngrok

# Iniciar con tunnel — Expo generará una URL pública
pnpm --filter mobile expo start --tunnel

# La URL del tunnel aparece en la terminal.
# Actualizar EXPO_PUBLIC_API_URL al tunnel de la API o usar Railway:
#   EXPO_PUBLIC_API_URL=https://bbc-production-62ef.up.railway.app
```

> **Nota:** Para la demo con dispositivos físicos sin red local compartida,
> usa la URL de Railway para la API y `expo start --tunnel` para la app.

## Comandos utiles

```bash
# Desarrollo (todos los servicios en paralelo)
pnpm run dev

# Tests API (sin DB — Prisma mockeado)
pnpm --filter api run test

# Build web
pnpm --filter web run build

# Prisma Studio (explorador visual de la DB)
pnpm --filter api run db:studio

# Generar QR labels para los 20 barriles demo
# → http://localhost:3000/barriles/etiquetas?ids=BBC-001,...,BBC-020
```

## Estructura del monorepo

```
bbc/
  apps/
    api/        Node.js 20 + Express + Prisma → :4000
    web/        Next.js 14 App Router          → :3000
    mobile/     Expo SDK 51 + React Native     → :8081
  packages/
    types/      Tipos TypeScript compartidos
    utils/      Helpers compartidos
```

## Produccion (Railway + Vercel)

| Servicio | URL |
|----------|-----|
| API | https://bbc-production-62ef.up.railway.app |
| Web | Vercel (configurar `NEXT_PUBLIC_API_URL` en env vars de Vercel) |

Variables de entorno necesarias en Railway:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `CORS_ORIGIN` — URL de Vercel (ej. `https://bbc-web.vercel.app`)

Variable en Vercel:
- `NEXT_PUBLIC_API_URL=https://bbc-production-62ef.up.railway.app`
