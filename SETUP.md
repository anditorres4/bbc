# BBC Barrel Track — Guía de Configuración Completa

Sistema de trazabilidad de barriles para BBC (craft brewery). Este documento cubre toda la instalación, desde cero hasta tener las tres aplicaciones corriendo: **API**, **Web Admin** y **App Móvil**.

---

## Tabla de Contenidos

1. [Prerequisitos](#1-prerequisitos)
2. [Clonar el repositorio](#2-clonar-el-repositorio)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Base de datos (Docker)](#4-base-de-datos-docker)
5. [Instalar dependencias](#5-instalar-dependencias)
6. [Inicializar la base de datos](#6-inicializar-la-base-de-datos)
7. [Correr el sistema localmente](#7-correr-el-sistema-localmente)
8. [App Móvil — Instalación detallada](#8-app-móvil--instalación-detallada)
9. [Imprimir etiquetas QR](#9-imprimir-etiquetas-qr)
10. [Despliegue en producción](#10-despliegue-en-producción)
11. [Credenciales de demo](#11-credenciales-de-demo)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisitos

Instalar las siguientes herramientas antes de continuar:

| Herramienta | Versión mínima | Instalación |
|-------------|---------------|-------------|
| Node.js | 20.x LTS | https://nodejs.org |
| pnpm | 9.x | `npm install -g pnpm` |
| Docker Desktop | 4.x | https://www.docker.com/products/docker-desktop |
| Git | 2.x | https://git-scm.com |
| Expo CLI | latest | `npm install -g expo-cli` _(solo para móvil)_ |

**En tu teléfono** (para pruebas en dispositivo físico):
- Android: instalar **Expo Go** desde Google Play Store
- iOS: instalar **Expo Go** desde App Store

---

## 2. Clonar el Repositorio

```bash
git clone <url-del-repositorio>
cd bbc
```

El proyecto es un **monorepo** con la siguiente estructura:

```
bbc/
  apps/
    api/       → Backend (Node.js + Express + Prisma)
    web/       → Panel admin (Next.js 14)
    mobile/    → App móvil (Expo + React Native)
  packages/
    types/     → Tipos TypeScript compartidos
    utils/     → Helpers compartidos
```

---

## 3. Variables de Entorno

### Raíz del monorepo (`.env`)

Copiar el ejemplo y completar:

```bash
cp .env.example .env
```

Contenido de `.env`:

```env
# Base de datos (Docker local)
DATABASE_URL="postgresql://bbc_user:bbc_pass@localhost:5432/bbc_db"
POSTGRES_USER=bbc_user
POSTGRES_PASSWORD=bbc_pass
POSTGRES_DB=bbc_db

# pgAdmin
PGADMIN_EMAIL=admin@bbc.com
PGADMIN_PASSWORD=admin123

# JWT (generar valores aleatorios seguros)
JWT_SECRET=cambia_esto_por_un_secreto_largo_y_aleatorio
JWT_REFRESH_SECRET=cambia_esto_por_otro_secreto_diferente
```

### API (`apps/api/.env`)

Crear este archivo (necesario porque Prisma CLI corre desde `apps/api/`):

```bash
cp apps/api/.env.example apps/api/.env   # si existe, o crear manualmente
```

Contenido:

```env
DATABASE_URL="postgresql://bbc_user:bbc_pass@localhost:5432/bbc_db"
JWT_SECRET=cambia_esto_por_un_secreto_largo_y_aleatorio
JWT_REFRESH_SECRET=cambia_esto_por_otro_secreto_diferente
NODE_ENV=development
PORT=3001
```

> **Importante:** el valor de `DATABASE_URL` y `JWT_*` debe coincidir con el `.env` raíz.

### Web (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Móvil (`apps/mobile/.env`)

```env
EXPO_PUBLIC_API_URL=http://localhost:3001
```

> Para pruebas en dispositivo físico, reemplazar `localhost` con la IP LAN de tu máquina. Ver sección 8.

---

## 4. Base de Datos (Docker)

```bash
# Iniciar PostgreSQL + pgAdmin
docker compose up -d

# Verificar que los contenedores estén corriendo
docker compose ps
```

| Servicio | Puerto | Acceso |
|----------|--------|--------|
| PostgreSQL | 5432 | `localhost:5432` (usuario/pass del `.env`) |
| pgAdmin 4 | 5050 | http://localhost:5050 |

**pgAdmin** → conectar servidor: host `postgres` (nombre del servicio Docker), puerto `5432`, usuario/pass del `.env`.

---

## 5. Instalar Dependencias

```bash
pnpm install
```

Esto instala dependencias para todos los workspaces (`api`, `web`, `mobile`, `packages/*`) en una sola operación.

---

## 6. Inicializar la Base de Datos

### Primera vez (crear tablas y secuencias)

```bash
pnpm --filter api exec prisma migrate dev --name init
```

Esto crea todas las tablas, índices, la secuencia `barrel_id_seq` (BBC-001, BBC-002…) y regenera el cliente de Prisma.

### Seed base (usuarios + puntos de entrega)

```bash
pnpm --filter api run db:seed
```

Crea 7 usuarios con emails `@bbc.co` y 3 puntos de entrega. Los barriles NO se seedean — se registran al escanear el QR físico.

### Seed de demo (para presentaciones y pruebas)

```bash
pnpm --filter api run db:seed-demo
```

Crea todo el seed base **más**:
- 20 barriles (BBC-001 a BBC-020) con estados variados
- 2 rutas para hoy con paradas y hoja de vida completa
- Barriles ya entregados listos para escanear como vacíos
- 4 alertas pre-existentes

> El seed-demo borra y recrea todos los datos transaccionales (barriles, rutas, eventos, alertas) pero preserva usuarios y puntos de entrega.

---

## 7. Correr el Sistema Localmente

### Todas las apps al mismo tiempo (recomendado)

```bash
pnpm dev
```

Turborepo levanta las tres apps en paralelo:

| App | Puerto | URL |
|-----|--------|-----|
| API | 3001 | http://localhost:3001 |
| Web Admin | 3000 | http://localhost:3000 |
| App Móvil | 8081 | http://localhost:8081 (web) |

### Individual (si se necesita)

```bash
# Solo la API
pnpm --filter api run dev

# Solo la web
pnpm --filter web run dev

# Solo la app móvil
pnpm --filter mobile run start
```

---

## 8. App Móvil — Instalación Detallada

Esta es la parte más específica. La app móvil corre en tres modos:

| Modo | Cómo | Cuándo usar |
|------|------|-------------|
| **Emulador/Simulador** | Android Studio / Xcode | Desarrollo sin dispositivo físico |
| **Dispositivo físico con Expo Go** | Escanear QR de Metro | Demo rápida, pruebas reales |
| **Navegador web** | http://localhost:8081 | Demo sin app, funciona en PC/tablet |

---

### 8.1 Modo Navegador Web (más fácil — sin configuración extra)

```bash
pnpm --filter mobile run start
```

Abrir http://localhost:8081 en el navegador. La app funciona como SPA con todas las funciones (el escaneo QR usa la cámara del navegador).

**Limitaciones del modo web:**
- Sin notificaciones push nativas
- La cámara de "escanear" usa la API del navegador (funciona en Chrome/Firefox/Safari)
- En móvil por el navegador: cambiar `EXPO_PUBLIC_API_URL` a la IP LAN (ver 8.3)

---

### 8.2 Configurar la IP LAN (necesario para dispositivo físico)

El teléfono y la PC deben estar en la **misma red WiFi**.

**Paso 1 — Encontrar la IP LAN de tu máquina:**

```bash
# Windows
ipconfig | findstr IPv4

# macOS / Linux
ifconfig | grep "inet "
```

Busca una IP como `192.168.1.X` o `10.0.0.X`. **No uses** `localhost` ni `127.0.0.1`.

**Paso 2 — Actualizar el `.env` de la app móvil:**

```env
# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001   ← tu IP real
```

**Paso 3 — Verificar que la API acepte conexiones desde esa IP:**

La API usa CORS configurado en `apps/api/src/app.ts`. En desarrollo permite todos los orígenes (`*`). Verificar que el firewall de Windows no bloquee el puerto 3001:

```powershell
# Abrir puerto 3001 en Windows Firewall (ejecutar como Administrador)
netsh advfirewall firewall add rule name="BBC API" dir=in action=allow protocol=TCP localport=3001
```

---

### 8.3 Instalar en Dispositivo Físico (Android / iOS)

**Prerequisito:** Expo Go instalado en el teléfono (ver sección 1).

**Paso 1 — Iniciar Metro bundler:**

```bash
pnpm --filter mobile run start
```

Verás una pantalla con un código QR en la terminal.

**Paso 2 — Conectar el teléfono:**

- **Android:** abrir Expo Go → "Scan QR code" → escanear el QR de la terminal
- **iOS:** abrir la cámara del iPhone → apuntar al QR → tocar el banner que aparece → abre Expo Go

**Paso 3 — Esperar la carga inicial:**

La primera vez Metro tiene que empaquetar el JavaScript (~30-60 segundos). Verás un progreso en la terminal. Subsiguientes cargas son más rápidas (cache).

**Paso 4 — Probar login:**

- Bodega: `bodega1@bbc.com` / `BBC2026!`
- Transportista: `trans1@bbc.com` / `BBC2026!`

---

### 8.4 Modo Túnel (cuando la red local no funciona)

Si el teléfono no puede conectarse directamente (redes corporativas, VPN, etc.):

```bash
pnpm --filter mobile run start -- --tunnel
```

Expo crea un túnel público via ngrok. El QR de la terminal apuntará a la URL del túnel en lugar de la IP local. **No requiere configurar la IP LAN.**

> Nota: el túnel es más lento que la red local. Usar solo si la conexión directa falla.

---

### 8.5 Emulador Android (sin teléfono físico)

**Prerequisito:** Android Studio instalado con al menos un AVD (Android Virtual Device) creado.

```bash
# Iniciar Metro y elegir Android
pnpm --filter mobile run start
# Presionar 'a' para abrir en emulador Android
```

O directamente:

```bash
pnpm --filter mobile run android
```

**Configurar AVD en Android Studio:**
1. Android Studio → More Actions → Virtual Device Manager
2. Create Device → seleccionar Pixel 6 (o similar)
3. Descargar API 34 (Android 14) → Next → Finish
4. Click ▶ para iniciar el emulador

Para el emulador, `localhost` sí funciona porque el emulador puede acceder a `10.0.2.2` que mapea al host. Expo maneja esto automáticamente.

---

### 8.6 Simulador iOS (solo en macOS)

**Prerequisito:** Xcode instalado desde la App Store (solo disponible en Mac).

```bash
pnpm --filter mobile run start
# Presionar 'i' para abrir en simulador iOS
```

O directamente:

```bash
pnpm --filter mobile run ios
```

---

### 8.7 Permisos de Cámara

La app solicita permiso de cámara automáticamente al entrar a cualquier pantalla de escaneo QR. En dispositivo físico:

- **Android:** aparece diálogo del sistema → "Permitir"
- **iOS:** aparece diálogo del sistema → "OK"
- **Navegador web:** aparece barra en la parte superior → "Permitir"

Si se denegó el permiso accidentalmente:
- Android: Ajustes → Apps → Expo Go → Permisos → Cámara → Permitir
- iOS: Ajustes → Expo Go → Cámara → Activar
- Navegador: hacer clic en el ícono de cámara/candado en la barra de URL → Permitir

---

### 8.8 Escaneo QR — Cómo Funciona

El sistema usa QR con formato `BBC-001` a `BBC-999` (o `BBC-1000` y más).

**En dispositivo físico (cámara):**
- La cámara detecta el QR automáticamente al enfocarlo
- No se necesita presionar ningún botón para escanear
- El barril se procesa al detectar el patrón `BBC-\d{3,5}`
- Si el barril no existe en la base de datos, se registra automáticamente
- Haptic feedback al escanear correctamente

**En navegador web (sin cámara de barril real):**
- Aparece un campo de texto alternativo
- Escribir el ID manualmente: `BBC-001`, `BBC-002`, etc.
- Presionar Enter o el botón de confirmar

**Para el demo de recogida de vacíos:**
Los barriles listos para escanear como vacíos en el seed-demo son:
- `BBC-001`, `BBC-002`, `BBC-003` → Restaurante El Sabor (Ruta Norte, trans1)
- `BBC-013`, `BBC-014` → Tienda Don Pedro (Ruta Sur, trans2)

---

### 8.9 Flujo Completo de Demo (Mobile)

#### Como Operario de Bodega (`bodega1@bbc.com`)

1. **Login** → entra al dashboard de bodega
2. **Alistamiento** → ver "Ruta Norte — 16 May" en estado PLANIFICADA
3. Tocar la ruta → pantalla de alistamiento
4. **Escanear barriles** para cargar el camión: BBC-004, BBC-005, BBC-011, BBC-012 (los que van en esa ruta)
5. Tocar "Confirmar Salida" → ruta pasa a EN_CURSO
6. **Recepción** → cuando el conductor devuelva los vacíos
7. Escanear BBC-001, BBC-002, BBC-003 (que el transportista trajo de regreso)
8. Al escanear el último barril de esa ruta → la ruta se cierra automáticamente como COMPLETADA

#### Como Transportista (`trans1@bbc.com`)

1. **Login** → entra al dashboard de transportista
2. **Mi Ruta** → ver "Ruta Norte — 16 May" ya en EN_CURSO (después del alistamiento)
3. Tocar la ruta → ver lista de paradas
4. **Parada 1: Restaurante El Sabor** → tocar la parada
5. **Entregar** → escanear BBC-001, BBC-002, BBC-003 (modo continuo — el scanner no se cierra entre escaneos)
6. Al completar los 3 → el modal se cierra automáticamente 1.6s después
7. **Recoger vacíos** → escanear los mismos BBC-001, BBC-002, BBC-003 (ya están en el punto esperando)
8. Ir a las otras paradas y repetir

---

## 9. Imprimir Etiquetas QR

Con la web corriendo:

```
http://localhost:3000/barriles/etiquetas?ids=BBC-001,BBC-002,BBC-003
```

Para todos los barriles del demo:

```
http://localhost:3000/barriles/etiquetas?ids=BBC-001,BBC-002,BBC-003,BBC-004,BBC-005,BBC-006,BBC-007,BBC-008,BBC-009,BBC-010,BBC-011,BBC-012,BBC-013,BBC-014,BBC-015
```

- La página muestra 3 etiquetas por fila, tamaño 8cm×8cm cada una
- Hacer clic en "Imprimir" → se abre el diálogo de impresión del navegador
- Recomendado: papel A4, sin márgenes, escala 100%
- Para uso real: imprimir en papel autoadhesivo y pegar en el barril

---

## 10. Despliegue en Producción

### API → Railway

1. Conectar el repositorio a Railway
2. Configurar variables de entorno en Railway:
   ```
   DATABASE_URL=<URL de PostgreSQL en Railway>
   JWT_SECRET=<secreto largo>
   JWT_REFRESH_SECRET=<otro secreto>
   NODE_ENV=production
   ```
3. Configurar el **Custom Start Command**:
   ```
   pnpm --filter api run start:prod
   ```
   > Este comando ejecuta: `prisma generate && prisma migrate deploy && node dist/index.js`
   > El proceso no debe terminar (el `node` al final mantiene el servidor vivo).

4. Verificar que el servicio quede en estado **"Active"** (no "Completed").

### Web Admin → Vercel

1. Conectar el repositorio a Vercel
2. Configurar en Vercel Dashboard → Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://bbc-production-62ef.up.railway.app
   ```
3. Vercel detecta Next.js automáticamente y despliega.

### App Móvil → Expo Web (Railway o Vercel)

La app también puede desplegarse como SPA web.

**Variables de entorno en producción:**
```
EXPO_PUBLIC_API_URL=https://bbc-production-62ef.up.railway.app
```

**Para Railway:** usar `pnpm --filter mobile run export` para generar la carpeta `dist/` y servirla como static.

---

## 11. Credenciales de Demo

### Semilla base (`db:seed`) — dominio `@bbc.co`

| Rol | Email | Password |
|-----|-------|----------|
| ADMIN | admin@bbc.co | BBC2026! |
| SUPERVISOR | supervisor@bbc.co | BBC2026! |
| OPERARIO_BODEGA | operario1@bbc.co | BBC2026! |
| OPERARIO_BODEGA | operario2@bbc.co | BBC2026! |
| TRANSPORTISTA | trans1@bbc.co | BBC2026! |
| TRANSPORTISTA | trans2@bbc.co | BBC2026! |
| TRANSPORTISTA | trans3@bbc.co | BBC2026! |

### Semilla demo (`db:seed-demo`) — dominio `@bbc.com`

| Rol | Email | Nombre |
|-----|-------|--------|
| ADMIN | admin@bbc.com | Admin Sistema |
| SUPERVISOR | supervisor@bbc.com | Carlos Supervisor |
| OPERARIO_BODEGA | bodega1@bbc.com | Maria Bodega |
| OPERARIO_BODEGA | bodega2@bbc.com | Juan Bodega |
| TRANSPORTISTA | trans1@bbc.com | Pedro Trans |
| TRANSPORTISTA | trans2@bbc.com | Luis Trans |
| TRANSPORTISTA | trans3@bbc.com | Ana Trans |

Password para todos: `BBC2026!`

---

## 12. Troubleshooting

### "Cannot connect to the API" en la app móvil

- Verificar que la API esté corriendo: `curl http://localhost:3001/health`
- Verificar que `EXPO_PUBLIC_API_URL` use la IP LAN (no `localhost`)
- Verificar que el puerto 3001 no esté bloqueado por el firewall
- Probar con `--tunnel` si la red local falla

### "Environment variable not found: DATABASE_URL"

- Asegurarse de que existe `apps/api/.env` (no solo el `.env` raíz)
- El archivo debe estar en `apps/api/` porque Prisma CLI corre desde ahí

### La app móvil muestra pantalla en blanco

- Verificar en la terminal de Metro si hay errores de JavaScript
- Sacudir el teléfono (o `Ctrl+M` en Android) → "Reload" para forzar recarga
- Si el bundle está corrupto: `pnpm --filter mobile run start -- --clear` (limpia caché de Metro)

### "Barrel ID mismatch" al correr seed-demo

- La secuencia de IDs no está en 1. Ocurre si hay barriles previos en la DB.
- El seed borra todos los barriles antes de crear, pero si falla a mitad puede quedar en estado inconsistente.
- Solución: `pnpm --filter api run db:seed-demo` nuevamente (el seed limpia antes de crear).

### Los QR no se detectan en la cámara

- Asegurarse de buena iluminación
- El QR debe estar impreso en tamaño suficiente (mínimo 3cm×3cm)
- La cámara debe estar a 15-30cm del QR
- En web: si la cámara pide permiso, aceptar en el navegador

### Error 404 en `/api/reportes` en producción

- Revisar el log de Railway: posiblemente hay un error de TypeScript en el build
- El build falla silenciosamente → Railway mantiene el deploy anterior
- Solución: revisar `reportes.router.ts` por errores de tipos, corregir y hacer push

### "Failed to load resource: 401" al navegar en la web

- El accessToken expiró y el refresh automático falló
- Solución: cerrar sesión manualmente y volver a loguearse

### Prisma "P2010" o errores de migración

```bash
# Resetear la base de datos completa (DESTRUYE TODOS LOS DATOS)
pnpm --filter api exec prisma migrate reset

# Volver a crear
pnpm --filter api exec prisma migrate dev
pnpm --filter api run db:seed-demo
```

---

## Comandos de Referencia Rápida

```bash
# Levantar todo
docker compose up -d && pnpm dev

# Seed de demo (rutas de hoy + barriles listos)
pnpm --filter api run db:seed-demo

# Solo API
pnpm --filter api run dev

# Solo web
pnpm --filter web run dev

# App móvil — emulador
pnpm --filter mobile run start

# App móvil — dispositivo físico (misma red)
# 1. Cambiar EXPO_PUBLIC_API_URL a IP LAN en apps/mobile/.env
# 2. pnpm --filter mobile run start
# 3. Escanear QR con Expo Go

# App móvil — túnel (redes problemáticas)
pnpm --filter mobile run start -- --tunnel

# Prisma Studio (explorar DB visualmente)
pnpm --filter api run db:studio

# Type-check todos los packages
pnpm --filter api run type-check
pnpm --filter web run type-check

# Tests API
pnpm --filter api run test

# Build completo
pnpm build
```
