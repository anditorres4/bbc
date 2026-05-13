# BBC Barrel Track — Mobile: Operario de Bodega
**Date:** 2026-05-13  
**Scope:** `apps/mobile/` — Auth, Bodega tabs, QRScanner, Offline queue  
**Target:** Expo SDK 51, expo-router 3.5, React Native 0.74, iOS/Android via Expo Go + web fallback

---

## 1. Design System

| Token | Value |
|---|---|
| Background | `#1A1612` |
| Card | `#2A2118` |
| Border | `#3D3027` |
| Amber (action) | `#D97706` |
| Text primary | `#FAFAF8` |
| Text secondary | `#A8A29E` |
| Action button height | 56 px min, borderRadius 8, bg amber, text black bold |
| Card | borderRadius 12, padding 16, borderWidth 1 |

All tokens live in `src/lib/theme.ts` as a flat const — no theming context needed.

---

## 2. File Structure

All files under `src/` (existing convention — `tsconfig.json` maps `@/*` → `./src/*`).

```
src/
  lib/
    theme.ts          design tokens
    api.ts            fetch client + SecureStore token injection + refresh
    auth.ts           SecureStore wrappers (get/set/clear access + refresh tokens)
    offline.ts        MMKV offline queue (enqueue / drain / clear)
    types.ts          domain types aligned to Prisma schema
    network.ts        NetInfo hook (online/offline/syncing state)
  components/
    QRScanner.tsx     shared scanner (native CameraView + web text fallback)
    BarrelStatusBadge.tsx
    NetworkDot.tsx    coloured dot (green/red/orange+spinner)
  app/
    _layout.tsx       root Stack, redirect / → /(auth)/login
    (auth)/
      _layout.tsx     plain Stack, no header
      login.tsx       email + password → SecureStore tokens
    (bodega)/
      _layout.tsx     Tabs: Inicio / Escanear / Alertas
      index.tsx       home dashboard
      escanear.tsx    standalone scanner screen
      recepcion.tsx   receive returning barrels
      alertas.tsx     alert list
      alistamiento/
        index.tsx     list of PLANIFICADA routes
        [routeId].tsx alistamiento detail + confirm salida
```

---

## 3. Core Libraries

### New installs
```
expo-haptics ~13.0.1   (vibration on QR hit)
lucide-react-native    (icons in home grid + alistamiento)
@shopify/flash-list    (perf list in [routeId].tsx)
@react-native-community/netinfo  (online/offline detection)
```

### Already present
`expo-camera ~15.0.16`, `react-native-mmkv ^3.1.0`, `expo-secure-store ~13.0.2`

### Removed / not used
`expo-barcode-scanner` — deprecated; `expo-camera`'s `CameraView` handles QR natively  
`expo-location` — no screen in the operario flow requires it

---

## 4. Auth Flow

1. App starts → `_layout.tsx` reads access token from SecureStore.
2. If none → redirect to `/(auth)/login`.
3. Login POST `/auth/login` → store `accessToken` + `refreshToken` in SecureStore.
4. All API calls inject `Authorization: Bearer <token>`.
5. 401 → try POST `/auth/refresh` with refreshToken → retry once → if still 401, clear tokens + redirect to login.
6. Logout clears both tokens from SecureStore.

---

## 5. API Client (`src/lib/api.ts`)

- Thin wrapper around `fetch`. Base URL from `process.env.EXPO_PUBLIC_API_URL`.
- `request<T>(path, options)` — injects token, handles 401 refresh (singleton promise to avoid race).
- Exported: `api.get`, `api.post`, `api.patch`, `api.delete`.
- On network failure (no connection): throws an `OfflineError` that callers catch to enqueue.

---

## 6. Offline Queue (`src/lib/offline.ts`)

MMKV key: `'offline_queue'`

```ts
type QueuedRequest = {
  id: string          // nanoid()
  endpoint: string
  method: 'POST' | 'PATCH'
  body: unknown
  timestamp: number
  retries: number
}
```

- `enqueue(req)` — appends to MMKV array.
- `drainQueue()` — reads array, fires each in order, removes on success, increments `retries` on failure. Max 3 retries; after 3 the item is dropped with a console.warn.
- `NetworkDrainer` component mounted in `(bodega)/_layout.tsx` — calls `drainQueue()` whenever `isConnected` flips to `true`.

---

## 7. QRScanner Component

**Props:**
```ts
interface QRScannerProps {
  context: 'alistamiento' | 'recepcion' | 'nuevo' | 'informativo'
  onResult: (barrel: BarrelScanResult, action: string) => void
  onClose: () => void
}
```

**Behaviour:**
- Native: `CameraView` fullscreen, `barCodeScannerSettings={{ barcodeTypes: ['qr'] }}`.
- On barcode detect: cooldown 2000 ms (useRef timestamp), `Haptics.impactAsync(Heavy)`.
- Calls `POST /api/barriles/scan` with the detected `qrCode`.
- Shows a **BottomSheet** (Animated.View sliding from bottom, no external library) with: ID, status badge, product, capacity.
- BottomSheet buttons depend on `context`:
  - `alistamiento` → "Marcar escaneado" / "Cancelar"
  - `recepcion` → "Recibir en bodega" / "Cancelar"  
  - `nuevo` → "Ver detalle" / "Cerrar"
  - `informativo` → "Cerrar" only
- Web fallback: TextInput + "Buscar" button replacing the camera view; same BottomSheet result.
- Overlay: `rgba(0,0,0,0.6)` with 260×260 amber-bordered scan window + animated scan line.
- Camera permission request shown inline if not granted.

---

## 8. Screen Designs

### `(auth)/login.tsx`
- Dark background `#1A1612`.
- BBC logo (Beer icon, amber, centred) + "BBC Barrel Track" title.
- Email + password TextInputs with amber focus border.
- "Iniciar sesión" amber button (56 px).
- Error message in red below button.

### `(bodega)/index.tsx` — Inicio
- SafeAreaView, dark bg.
- Header: "Hola, [nombre]" (large) + `NetworkDot` top-right.
- 2×2 grid of action cards (flex, minHeight 100): **Alistar Ruta**, **Recibir Barriles**, **Escanear**, **Alertas**.
  - Each card: lucide icon + label + optional badge count.
  - Navigate to appropriate screen on press.
- "Hoy" section below grid: counter of barrels the user interacted with during the current app session (local React state, increments on each successful scan/recepcion, resets on restart).

### `(bodega)/escanear.tsx` — Escanear
- Full-screen `QRScanner` with `context='informativo'`.
- Back button top-left.

### `(bodega)/alistamiento/index.tsx`
- List of routes with `status=PLANIFICADA` via `GET /api/rutas?status=PLANIFICADA`.
- Each row: route name, date, transportista name, stop count.
- Tap → navigate to `alistamiento/[routeId]`.
- Pull-to-refresh.

### `(bodega)/alistamiento/[routeId].tsx` — Flujo alistamiento
- Header: route name, date, transportista.
- Amber progress bar: `X / Y barriles escaneados`.
- FlashList of stops, each stop is a collapsible section.
  - Stop header: delivery point name + `X/Y` barrels tapped.
  - Stop body: list of required barrels — each shows ID + product + checkbox (unchecked / amber checked).
- FAB "Abrir Scanner" bottom-right → opens `QRScanner` with `context='alistamiento'`.
  - `onResult`: if barrel belongs to this route and is in `EN_ALISTAMIENTO`, mark checkbox locally.
  - If not in this route → Toast warning (orange, 2 s).
  - If already checked → Toast "Ya escaneado".
- Sticky bottom bar "Confirmar Salida" — disabled until all barrels checked.
  - On press: `POST /api/rutas/:id/iniciar` → success → navigate back to alistamiento list.
  - If offline: enqueue, show success optimistically, navigate back.

### `(bodega)/recepcion.tsx` — Recibir barriles
- Header "Recepción de barriles".
- `QRScanner` with `context='recepcion'` embedded (not fullscreen modal).
- On result action "Recibir en bodega": `POST /api/barriles/:id/recibir`.
- Running list of received barrels in this session (local state).

### `(bodega)/alertas.tsx`
- `GET /api/alertas?isRead=false` — flat list grouped by severity CRITICAL → WARNING → INFO.
- Tap → `PATCH /api/alertas/:id/leer`.
- Pull-to-refresh.

---

## 9. Offline Strategy

| Action | Online | Offline |
|---|---|---|
| POST iniciar ruta | Direct | Enqueue + optimistic navigate |
| POST recibir barril | Direct | Enqueue + local list update |
| PATCH alerta leída | Direct | Enqueue |
| GET (all reads) | Direct | Show stale MMKV cache or empty state |

Read responses are NOT cached in MMKV in this iteration — only mutations are queued.

---

## 10. Navigation Guards

`app/_layout.tsx` uses `useEffect` to read SecureStore on mount:
- Token present → `router.replace('/(bodega)')` 
- Token absent → `router.replace('/(auth)/login')`

`(bodega)/_layout.tsx` mounts `NetworkDrainer` (invisible component that triggers drain on reconnect).

---

## 11. Excluded from this iteration

- Transportista screens (separate spec)
- Push notifications
- Offline read caching (MMKV for mutations only)
- MMKV persistence for barrel scan history
- Deep links from alerts to barrel detail
