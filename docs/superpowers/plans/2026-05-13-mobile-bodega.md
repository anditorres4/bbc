# Mobile — Operario de Bodega Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all Expo RN screens for the BBC Barrel Track warehouse operator: auth, dashboard, QR scanning, alistamiento workflow, barrel reception, and alerts — with offline mutation queuing via MMKV.

**Architecture:** Expo Router `src/app/` file-system routing with `(auth)` and `(bodega)` route groups. A shared `QRScanner` uses `expo-camera CameraView` on native and a `TextInput` fallback on web. Mutations that fail offline are queued in MMKV and drained automatically on reconnect via `@react-native-community/netinfo`. No circular deps: `OfflineError` lives in `api.ts`; `offline.ts` drains with raw fetch (no import of api.ts).

**Tech Stack:** Expo SDK 51, expo-router 3.5, expo-camera 15, expo-haptics, expo-secure-store, react-native-mmkv, @shopify/flash-list, @react-native-community/netinfo, lucide-react-native

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/mobile/app.json` | Modify | `userInterfaceStyle: dark` |
| `apps/mobile/.env` | Create | `EXPO_PUBLIC_API_URL` |
| `src/lib/theme.ts` | Create | Design tokens |
| `src/lib/types.ts` | Create | Domain types |
| `src/lib/auth.ts` | Create | SecureStore token wrappers |
| `src/lib/api.ts` | Create | Fetch client + refresh cycle |
| `src/lib/offline.ts` | Create | MMKV queue enqueue/drain |
| `src/lib/network.ts` | Create | `useNetworkState` hook |
| `src/components/BarrelStatusBadge.tsx` | Create | Status pill |
| `src/components/NetworkDot.tsx` | Create | Green/red/orange dot |
| `src/components/QRScanner.tsx` | Create | Camera + BottomSheet + web fallback |
| `src/app/_layout.tsx` | Modify | Root Stack + auth redirect |
| `src/app/(auth)/_layout.tsx` | Create | Plain Stack |
| `src/app/(auth)/login.tsx` | Create | Login screen |
| `src/app/(bodega)/_layout.tsx` | Create | Tabs + NetworkDrainer |
| `src/app/(bodega)/index.tsx` | Create | Home dashboard |
| `src/app/(bodega)/escanear.tsx` | Create | Standalone scanner |
| `src/app/(bodega)/alistamiento/index.tsx` | Create | Route list |
| `src/app/(bodega)/alistamiento/[routeId].tsx` | Create | Alistamiento detail |
| `src/app/(bodega)/recepcion.tsx` | Create | Receive barrels |
| `src/app/(bodega)/alertas.tsx` | Create | Alerts |

---

## Task 1 — Install dependencies and configure environment

**Files:**
- Modify: `apps/mobile/package.json` (via pnpm)
- Modify: `apps/mobile/app.json`
- Create: `apps/mobile/.env`

- [ ] **Step 1.1 — Install new packages**

Run from the monorepo root:
```bash
pnpm --filter mobile add expo-haptics lucide-react-native @shopify/flash-list @react-native-community/netinfo
```
Expected last line: `Done in X.Xs`

- [ ] **Step 1.2 — Set dark mode and fix app.json**

Edit `apps/mobile/app.json` — change `"userInterfaceStyle"` and add iOS camera usage:
```json
{
  "expo": {
    "name": "BBC Barrel Track",
    "slug": "bbc-barrel-track",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#1A1612"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.bbc.barreltrack",
      "infoPlist": {
        "NSCameraUsageDescription": "Permite escanear códigos QR de barriles"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1A1612"
      },
      "package": "com.bbc.barreltrack",
      "permissions": ["CAMERA"]
    },
    "plugins": [
      "expo-router",
      ["expo-camera", { "cameraPermission": "Permite escanear códigos QR de barriles" }]
    ],
    "scheme": "bbc-barrel-track",
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

- [ ] **Step 1.3 — Create .env**

Create `apps/mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://localhost:4000
```

---

## Task 2 — Design tokens and domain types

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/types.ts`

- [ ] **Step 2.1 — Create `src/lib/theme.ts`**

```typescript
export const theme = {
  bg: '#1A1612',
  card: '#2A2118',
  border: '#3D3027',
  amber: '#D97706',
  text: '#FAFAF8',
  textSecondary: '#A8A29E',
  red: '#EF4444',
  green: '#22C55E',
  orange: '#F97316',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const
```

- [ ] **Step 2.2 — Create `src/lib/types.ts`**

```typescript
export type BarrelStatus =
  | 'EN_BODEGA'
  | 'EN_ALISTAMIENTO'
  | 'EN_TRANSPORTE'
  | 'ENTREGADO'
  | 'EN_RECOGIDA'
  | 'DEVUELTO'
  | 'EN_MANTENIMIENTO'
  | 'BAJA'

export type Role = 'ADMIN' | 'SUPERVISOR' | 'OPERARIO_BODEGA' | 'TRANSPORTISTA'
export type RouteStatus = 'PLANIFICADA' | 'EN_CURSO' | 'COMPLETADA' | 'CON_NOVEDAD' | 'CANCELADA'
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
}

export interface Barrel {
  id: string
  qrCode: string
  status: BarrelStatus
  product: string | null
  capacity: number
  notes: string | null
}

export interface BarrelScanResult {
  barrel: Barrel
  created: boolean
}

export interface RouteStopBarrel {
  id: string
  barrelId: string
  product: string
  status: string
  barrel?: Pick<Barrel, 'id' | 'qrCode'>
}

export interface DeliveryPoint {
  id: string
  name: string
  address: string
}

export interface RouteStop {
  id: string
  routeId: string
  deliveryPointId: string
  position: number
  status: string
  barrelsDelivered: number
  totalBarrels: number
  deliveryPoint?: DeliveryPoint
  barrels?: RouteStopBarrel[]
}

export interface Route {
  id: string
  name: string
  date: string
  status: RouteStatus
  vehiclePlate: string | null
  transportistId: string
  transportist?: Pick<User, 'id' | 'name'>
  stops?: RouteStop[]
}

export interface Alert {
  id: string
  type: string
  severity: AlertSeverity
  message: string
  isRead: boolean
  barrelId: string | null
  routeId: string | null
  createdAt: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}
```

- [ ] **Step 2.3 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors (only the new files need to be clean).

---

## Task 3 — Auth token wrappers

**Files:**
- Create: `src/lib/auth.ts`

- [ ] **Step 3.1 — Create `src/lib/auth.ts`**

```typescript
import * as SecureStore from 'expo-secure-store'

const ACCESS_KEY = 'bbc_access_token'
const REFRESH_KEY = 'bbc_refresh_token'
const USER_KEY = 'bbc_user'

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY)
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY)
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
  ])
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ])
}

export async function storeUser(user: object): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
}

export async function getStoredUser<T>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
```

- [ ] **Step 3.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 4 — API client

**Files:**
- Create: `src/lib/api.ts`

- [ ] **Step 4.1 — Create `src/lib/api.ts`**

```typescript
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth'

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'

export class OfflineError extends Error {
  constructor() {
    super('No hay conexión a internet')
    this.name = 'OfflineError'
  }
}

export class AuthError extends Error {
  constructor() {
    super('Sesión expirada')
    this.name = 'AuthError'
  }
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return null
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const { accessToken, refreshToken: newRefresh } = data as {
      accessToken: string
      refreshToken: string
    }
    await setTokens(accessToken, newRefresh)
    return accessToken
  } catch {
    return null
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

async function request<T>(
  path: string,
  method: Method,
  body?: unknown,
  retry = true
): Promise<T> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new OfflineError()
  }

  if (res.status === 401 && retry) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    const newToken = await refreshPromise
    if (!newToken) {
      await clearTokens()
      throw new AuthError()
    }
    return request<T>(path, method, body, false)
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }))
    throw Object.assign(new Error(errBody.error ?? res.statusText), {
      status: res.status,
      code: errBody.code,
    })
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
}
```

- [ ] **Step 4.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 5 — Offline queue and network hook

**Files:**
- Create: `src/lib/offline.ts`
- Create: `src/lib/network.ts`

- [ ] **Step 5.1 — Create `src/lib/offline.ts`**

Note: drains with raw fetch (no api.ts import) to avoid circular deps.

```typescript
import { MMKV } from 'react-native-mmkv'
import { getAccessToken } from './auth'

const storage = new MMKV({ id: 'bbc-offline' })
const QUEUE_KEY = 'offline_queue'
const SESSION_COUNT_KEY = 'session_count'
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'

export interface QueuedRequest {
  id: string
  endpoint: string
  method: 'POST' | 'PATCH'
  body: unknown
  timestamp: number
  retries: number
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function getQueue(): QueuedRequest[] {
  const raw = storage.getString(QUEUE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as QueuedRequest[]
  } catch {
    return []
  }
}

function setQueue(items: QueuedRequest[]): void {
  storage.set(QUEUE_KEY, JSON.stringify(items))
}

export function enqueue(endpoint: string, method: 'POST' | 'PATCH', body: unknown): void {
  const items = getQueue()
  items.push({ id: generateId(), endpoint, method, body, timestamp: Date.now(), retries: 0 })
  setQueue(items)
}

export function queueSize(): number {
  return getQueue().length
}

export async function drainQueue(): Promise<void> {
  const items = getQueue()
  if (items.length === 0) return

  const token = await getAccessToken()
  const remaining: QueuedRequest[] = []

  for (const item of items) {
    if (item.retries >= 3) continue
    try {
      const res = await fetch(`${BASE}${item.endpoint}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(item.body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      remaining.push({ ...item, retries: item.retries + 1 })
    }
  }

  setQueue(remaining)
}

export function incrementSessionCount(): void {
  const current = storage.getNumber(SESSION_COUNT_KEY) ?? 0
  storage.set(SESSION_COUNT_KEY, current + 1)
}

export function getSessionCount(): number {
  return storage.getNumber(SESSION_COUNT_KEY) ?? 0
}

export function resetSessionCount(): void {
  storage.set(SESSION_COUNT_KEY, 0)
}
```

- [ ] **Step 5.2 — Create `src/lib/network.ts`**

```typescript
import { useState, useEffect } from 'react'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

export type NetworkStatus = 'online' | 'offline' | 'syncing'

export function useNetworkState() {
  const [isConnected, setIsConnected] = useState<boolean>(true)
  const [status, setStatus] = useState<NetworkStatus>('online')

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false
      setIsConnected(connected)
      setStatus(connected ? 'online' : 'offline')
    })
    return unsubscribe
  }, [])

  return { isConnected, status, setStatus }
}
```

- [ ] **Step 5.3 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 6 — Shared components: BarrelStatusBadge and NetworkDot

**Files:**
- Create: `src/components/BarrelStatusBadge.tsx`
- Create: `src/components/NetworkDot.tsx`

- [ ] **Step 6.1 — Create `src/components/BarrelStatusBadge.tsx`**

```typescript
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { BarrelStatus } from '@/lib/types'

const STATUS_CONFIG: Record<BarrelStatus, { label: string; bg: string }> = {
  EN_BODEGA: { label: 'En Bodega', bg: '#16a34a' },
  EN_ALISTAMIENTO: { label: 'Alistamiento', bg: '#f59e0b' },
  EN_TRANSPORTE: { label: 'En Transporte', bg: '#2563eb' },
  ENTREGADO: { label: 'Entregado', bg: '#7c3aed' },
  EN_RECOGIDA: { label: 'En Recogida', bg: '#0891b2' },
  DEVUELTO: { label: 'Devuelto', bg: '#0891b2' },
  EN_MANTENIMIENTO: { label: 'Mantenimiento', bg: '#d97706' },
  BAJA: { label: 'Baja', bg: '#dc2626' },
}

interface Props {
  status: BarrelStatus
}

export function BarrelStatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: '#78716c' }
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={styles.label}>{cfg.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  label: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
})
```

- [ ] **Step 6.2 — Create `src/components/NetworkDot.tsx`**

```typescript
import React from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import type { NetworkStatus } from '@/lib/network'
import { theme } from '@/lib/theme'

interface Props {
  status: NetworkStatus
}

export function NetworkDot({ status }: Props) {
  if (status === 'syncing') {
    return <ActivityIndicator size="small" color={theme.orange} />
  }
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: status === 'online' ? theme.green : theme.red },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
})
```

- [ ] **Step 6.3 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 7 — Root layout and auth layout

**Files:**
- Modify: `src/app/_layout.tsx`
- Create: `src/app/(auth)/_layout.tsx`

- [ ] **Step 7.1 — Rewrite `src/app/_layout.tsx`**

```typescript
import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { getAccessToken } from '@/lib/auth'
import { theme } from '@/lib/theme'

export default function RootLayout() {
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    async function checkAuth() {
      const token = await getAccessToken()
      const inAuth = segments[0] === '(auth)'
      if (!token && !inAuth) {
        router.replace('/(auth)/login')
      } else if (token && inAuth) {
        router.replace('/(bodega)')
      }
    }
    checkAuth()
  }, [segments, router])

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      />
    </>
  )
}
```

- [ ] **Step 7.2 — Create `src/app/(auth)/_layout.tsx`**

```typescript
import { Stack } from 'expo-router'
import { theme } from '@/lib/theme'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    />
  )
}
```

- [ ] **Step 7.3 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 8 — Login screen

**Files:**
- Create: `src/app/(auth)/login.tsx`

- [ ] **Step 8.1 — Create `src/app/(auth)/login.tsx`**

```typescript
import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Beer } from 'lucide-react-native'
import { api } from '@/lib/api'
import { setTokens, storeUser } from '@/lib/auth'
import { theme, spacing, radius } from '@/lib/theme'
import type { AuthResponse } from '@/lib/types'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Ingresa email y contraseña')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await api.post<AuthResponse>('/auth/login', { email, password })
      await setTokens(res.accessToken, res.refreshToken)
      await storeUser(res.user)
      router.replace('/(bodega)')
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message ?? 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.center}>
          <View style={styles.logoContainer}>
            <Beer size={36} color="#fff" />
          </View>
          <Text style={styles.title}>BBC Barrel Track</Text>
          <Text style={styles.subtitle}>Operario de Bodega</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholderTextColor={theme.textSecondary}
            placeholder="usuario@bbc.co"
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholderTextColor={theme.textSecondary}
            placeholder="••••••••"
            onSubmitEditing={handleLogin}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.buttonText}>Iniciar sesión</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  center: { alignItems: 'center', marginBottom: spacing.xl },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: theme.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.amber },
  subtitle: { fontSize: 14, color: theme.textSecondary, marginTop: 4 },
  form: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  label: { fontSize: 13, fontWeight: '500', color: theme.textSecondary, marginBottom: 6 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: theme.text,
    backgroundColor: theme.bg,
    fontSize: 15,
  },
  error: { color: theme.red, fontSize: 13, marginTop: spacing.sm },
  button: {
    height: 56,
    backgroundColor: theme.amber,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
})
```

- [ ] **Step 8.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 9 — QRScanner component

**Files:**
- Create: `src/components/QRScanner.tsx`

- [ ] **Step 9.1 — Create `src/components/QRScanner.tsx`**

```typescript
import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, Platform, Modal, ActivityIndicator,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { X } from 'lucide-react-native'
import { api, OfflineError } from '@/lib/api'
import { BarrelStatusBadge } from './BarrelStatusBadge'
import { theme, spacing, radius } from '@/lib/theme'
import type { BarrelScanResult } from '@/lib/types'

const SCAN_WINDOW = 260
const SHEET_HEIGHT = 320
const COOLDOWN_MS = 2000

export type ScannerContext = 'alistamiento' | 'recepcion' | 'nuevo' | 'informativo'

interface Props {
  context: ScannerContext
  onResult: (result: BarrelScanResult, action: string) => void
  onClose: () => void
}

export function QRScanner({ context, onResult, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BarrelScanResult | null>(null)
  const [webInput, setWebInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const lastScanRef = useRef<number>(0)
  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current
  const scanLineAnim = useRef(new Animated.Value(0)).current

  // Scan line loop
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [scanLineAnim])

  const scanLineY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_WINDOW - 4],
  })

  function showSheet() {
    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start()
  }

  function hideSheet() {
    Animated.timing(sheetAnim, {
      toValue: SHEET_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setResult(null))
  }

  async function processQrCode(qrCode: string) {
    setError(null)
    setLoading(true)
    try {
      const data = await api.post<BarrelScanResult>('/api/barriles/scan', { qrCode })
      setResult(data)
      showSheet()
    } catch (err) {
      if (err instanceof OfflineError) {
        setError('Sin conexión — reintenta cuando haya red')
      } else {
        const e = err as { message?: string }
        setError(e?.message ?? 'Error al consultar barril')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleBarCodeScanned({ data }: { data: string }) {
    const now = Date.now()
    if (now - lastScanRef.current < COOLDOWN_MS) return
    lastScanRef.current = now
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    processQrCode(data)
  }

  function handleWebSearch() {
    if (!webInput.trim()) return
    processQrCode(webInput.trim())
  }

  function handleAction(action: string) {
    if (!result) return
    onResult(result, action)
    hideSheet()
  }

  const actionButtons: { label: string; action: string; primary?: boolean }[] =
    context === 'alistamiento'
      ? [
          { label: 'Marcar escaneado', action: 'mark', primary: true },
          { label: 'Cancelar', action: 'cancel' },
        ]
      : context === 'recepcion'
      ? [
          { label: 'Recibir en bodega', action: 'recibir', primary: true },
          { label: 'Cancelar', action: 'cancel' },
        ]
      : context === 'nuevo'
      ? [
          { label: 'Ver detalle', action: 'detail', primary: true },
          { label: 'Cerrar', action: 'cancel' },
        ]
      : [{ label: 'Cerrar', action: 'cancel' }]

  const isWeb = Platform.OS === 'web'

  return (
    <View style={styles.container}>
      {/* Camera or web fallback */}
      {isWeb ? (
        <View style={styles.webFallback}>
          <Text style={styles.webTitle}>Ingresar código QR</Text>
          <TextInput
            style={styles.webInput}
            value={webInput}
            onChangeText={setWebInput}
            placeholder="BBC-001 o código del barril"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            onSubmitEditing={handleWebSearch}
          />
          <TouchableOpacity
            style={styles.webButton}
            onPress={handleWebSearch}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.webButtonText}>Buscar</Text>
            }
          </TouchableOpacity>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      ) : !permission ? (
        <View style={styles.permCenter}>
          <ActivityIndicator color={theme.amber} />
        </View>
      ) : !permission.granted ? (
        <View style={styles.permCenter}>
          <Text style={styles.permText}>Se necesita acceso a la cámara</Text>
          <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
            <Text style={styles.permButtonText}>Permitir acceso</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barCodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={loading ? undefined : handleBarCodeScanned}
          />

          {/* Dark overlay */}
          <View style={styles.overlay} pointerEvents="none">
            {/* Top mask */}
            <View style={styles.maskTop} />
            <View style={styles.middleRow}>
              <View style={styles.maskSide} />
              {/* Scan window */}
              <View style={styles.scanWindow}>
                <Animated.View
                  style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]}
                />
              </View>
              <View style={styles.maskSide} />
            </View>
            <View style={styles.maskBottom} />
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </>
      )}

      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <X size={22} color={theme.text} />
      </TouchableOpacity>

      {/* Bottom sheet */}
      {result && (
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetRow}>
            <Text style={styles.sheetId}>{result.barrel.id}</Text>
            {result.created && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NUEVO</Text>
              </View>
            )}
          </View>
          <BarrelStatusBadge status={result.barrel.status} />
          {result.barrel.product && (
            <Text style={styles.sheetDetail}>{result.barrel.product}</Text>
          )}
          <Text style={styles.sheetDetail}>{result.barrel.capacity} L</Text>

          <View style={styles.sheetActions}>
            {actionButtons.map(btn => (
              <TouchableOpacity
                key={btn.action}
                style={[styles.sheetBtn, btn.primary && styles.sheetBtnPrimary]}
                onPress={() => handleAction(btn.action)}
                activeOpacity={0.8}
              >
                <Text style={[styles.sheetBtnText, btn.primary && styles.sheetBtnTextPrimary]}>
                  {btn.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject },
  maskTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  maskBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  middleRow: { flexDirection: 'row', height: SCAN_WINDOW },
  maskSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanWindow: {
    width: SCAN_WINDOW,
    height: SCAN_WINDOW,
    borderWidth: 2,
    borderColor: theme.amber,
    overflow: 'hidden',
  },
  scanLine: {
    height: 3,
    backgroundColor: theme.amber,
    opacity: 0.8,
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 200,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(239,68,68,0.9)',
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: theme.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sheetId: { fontSize: 20, fontWeight: 'bold', color: theme.text },
  newBadge: {
    backgroundColor: theme.green,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  sheetDetail: { color: theme.textSecondary, fontSize: 14, marginTop: 4 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  sheetBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBtnPrimary: { backgroundColor: theme.amber, borderColor: theme.amber },
  sheetBtnText: { color: theme.text, fontWeight: '600', fontSize: 14 },
  sheetBtnTextPrimary: { color: '#000' },
  // Web fallback
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: theme.bg,
  },
  webTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  webInput: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: theme.text,
    backgroundColor: theme.card,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  webButton: {
    height: 56,
    backgroundColor: theme.amber,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webButtonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  permCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  permText: { color: theme.text, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  permButton: {
    height: 48,
    paddingHorizontal: 24,
    backgroundColor: theme.amber,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permButtonText: { color: '#000', fontWeight: '700' },
})
```

- [ ] **Step 9.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 10 — Bodega layout (tabs + NetworkDrainer)

**Files:**
- Create: `src/app/(bodega)/_layout.tsx`

- [ ] **Step 10.1 — Create `src/app/(bodega)/_layout.tsx`**

```typescript
import { useEffect, useRef } from 'react'
import { Tabs } from 'expo-router'
import { Home, ScanLine, Bell } from 'lucide-react-native'
import { theme } from '@/lib/theme'
import { useNetworkState } from '@/lib/network'
import { drainQueue, queueSize } from '@/lib/offline'

function NetworkDrainer() {
  const { isConnected, setStatus } = useNetworkState()
  const wasPreviouslyOffline = useRef(false)

  useEffect(() => {
    if (!isConnected) {
      wasPreviouslyOffline.current = true
      return
    }
    if (wasPreviouslyOffline.current && queueSize() > 0) {
      wasPreviouslyOffline.current = false
      setStatus('syncing')
      drainQueue().finally(() => setStatus('online'))
    } else {
      wasPreviouslyOffline.current = false
    }
  }, [isConnected, setStatus])

  return null
}

export default function BodegaLayout() {
  return (
    <>
      <NetworkDrainer />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: theme.amber,
          tabBarInactiveTintColor: theme.textSecondary,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color }) => <Home size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="escanear"
          options={{
            title: 'Escanear',
            tabBarIcon: ({ color }) => <ScanLine size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="alertas"
          options={{
            title: 'Alertas',
            tabBarIcon: ({ color }) => <Bell size={22} color={color} />,
          }}
        />
        {/* Hidden screens — not shown in tabs */}
        <Tabs.Screen name="recepcion" options={{ href: null }} />
        <Tabs.Screen name="alistamiento" options={{ href: null }} />
      </Tabs>
    </>
  )
}
```

- [ ] **Step 10.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 11 — Home screen

**Files:**
- Create: `src/app/(bodega)/index.tsx`

- [ ] **Step 11.1 — Create `src/app/(bodega)/index.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import {
  ClipboardList, PackageCheck, ScanLine, Bell,
} from 'lucide-react-native'
import { theme, spacing, radius } from '@/lib/theme'
import { useNetworkState } from '@/lib/network'
import { NetworkDot } from '@/components/NetworkDot'
import { getStoredUser } from '@/lib/auth'
import { getSessionCount } from '@/lib/offline'
import type { User } from '@/lib/types'

interface ActionCard {
  label: string
  icon: React.ReactNode
  route: string
  badge?: number
}

export default function HomeScreen() {
  const router = useRouter()
  const { status } = useNetworkState()
  const [user, setUser] = useState<Pick<User, 'name'> | null>(null)
  const [sessionCount, setSessionCount] = useState(0)

  useEffect(() => {
    getStoredUser<User>().then(u => setUser(u))
  }, [])

  useFocusEffect(
    useCallback(() => {
      setSessionCount(getSessionCount())
    }, [])
  )

  const cards: ActionCard[] = [
    {
      label: 'Alistar Ruta',
      icon: <ClipboardList size={32} color={theme.amber} />,
      route: '/(bodega)/alistamiento',
    },
    {
      label: 'Recibir Barriles',
      icon: <PackageCheck size={32} color={theme.amber} />,
      route: '/(bodega)/recepcion',
    },
    {
      label: 'Escanear',
      icon: <ScanLine size={32} color={theme.amber} />,
      route: '/(bodega)/escanear',
    },
    {
      label: 'Alertas',
      icon: <Bell size={32} color={theme.amber} />,
      route: '/(bodega)/alertas',
    },
  ]

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola,</Text>
            <Text style={styles.name}>{user?.name ?? '...'}</Text>
          </View>
          <NetworkDot status={status} />
        </View>

        {/* Action grid */}
        <View style={styles.grid}>
          {cards.map(card => (
            <TouchableOpacity
              key={card.route}
              style={styles.card}
              onPress={() => router.push(card.route as never)}
              activeOpacity={0.75}
            >
              {card.icon}
              <Text style={styles.cardLabel}>{card.label}</Text>
              {card.badge !== undefined && card.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{card.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Session counter */}
        <View style={styles.statsCard}>
          <Text style={styles.statsLabel}>Barriles procesados hoy</Text>
          <Text style={styles.statsValue}>{sessionCount}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  greeting: { fontSize: 14, color: theme.textSecondary },
  name: { fontSize: 24, fontWeight: 'bold', color: theme.text },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  card: {
    width: '47%',
    minHeight: 100,
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cardLabel: {
    color: theme.text,
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: theme.red,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  statsCard: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statsLabel: { color: theme.textSecondary, fontSize: 13 },
  statsValue: { color: theme.amber, fontSize: 40, fontWeight: 'bold', marginTop: 4 },
})
```

- [ ] **Step 11.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 12 — Escanear screen

**Files:**
- Create: `src/app/(bodega)/escanear.tsx`

- [ ] **Step 12.1 — Create `src/app/(bodega)/escanear.tsx`**

```typescript
import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { QRScanner } from '@/components/QRScanner'
import { theme } from '@/lib/theme'
import type { BarrelScanResult } from '@/lib/types'

export default function EscanearScreen() {
  const router = useRouter()

  function handleResult(_result: BarrelScanResult, action: string) {
    if (action === 'cancel') return
    // informativo context — just close
  }

  return (
    <View style={styles.container}>
      <QRScanner
        context="informativo"
        onResult={handleResult}
        onClose={() => router.back()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
})
```

- [ ] **Step 12.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 13 — Alistamiento route list

**Files:**
- Create: `src/app/(bodega)/alistamiento/index.tsx`
- Create: `src/app/(bodega)/alistamiento/_layout.tsx`

- [ ] **Step 13.1 — Create `src/app/(bodega)/alistamiento/_layout.tsx`**

```typescript
import { Stack } from 'expo-router'
import { theme } from '@/lib/theme'

export default function AlistamientoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    />
  )
}
```

- [ ] **Step 13.2 — Create `src/app/(bodega)/alistamiento/index.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { ChevronRight, MapPin, User, ArrowLeft } from 'lucide-react-native'
import { api } from '@/lib/api'
import { theme, spacing, radius } from '@/lib/theme'
import type { Route, PaginatedResponse } from '@/lib/types'

export default function AlistamientoListScreen() {
  const router = useRouter()
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchRoutes() {
    try {
      const data = await api.get<PaginatedResponse<Route>>(
        '/api/rutas?status=PLANIFICADA&pageSize=50'
      )
      setRoutes(data.items)
    } catch {
      // silently handle — show empty state
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchRoutes()
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchRoutes()
  }, [])

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={theme.amber} style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Rutas para Alistar</Text>
      </View>

      <FlashList
        data={routes}
        estimatedItemSize={100}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.amber}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay rutas planificadas</Text>
          </View>
        }
        renderItem={({ item: route }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/(bodega)/alistamiento/${route.id}` as never)}
            activeOpacity={0.75}
          >
            <View style={styles.cardRow}>
              <Text style={styles.routeName}>{route.name}</Text>
              <ChevronRight size={18} color={theme.textSecondary} />
            </View>
            <Text style={styles.routeDate}>
              {new Date(route.date).toLocaleDateString('es-CO', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
            </Text>
            <View style={styles.metaRow}>
              {route.transportist && (
                <View style={styles.meta}>
                  <User size={13} color={theme.textSecondary} />
                  <Text style={styles.metaText}>{route.transportist.name}</Text>
                </View>
              )}
              <View style={styles.meta}>
                <MapPin size={13} color={theme.textSecondary} />
                <Text style={styles.metaText}>{route.stops?.length ?? 0} paradas</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: theme.text },
  list: { padding: spacing.md },
  card: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  routeName: { fontSize: 16, fontWeight: '600', color: theme.text, flex: 1 },
  routeDate: { color: theme.textSecondary, fontSize: 13, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: theme.textSecondary, fontSize: 12 },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { color: theme.textSecondary, fontSize: 15 },
})
```

- [ ] **Step 13.3 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 14 — Alistamiento detail with QR scanning

**Files:**
- Create: `src/app/(bodega)/alistamiento/[routeId].tsx`

- [ ] **Step 14.1 — Create `src/app/(bodega)/alistamiento/[routeId].tsx`**

```typescript
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import {
  ArrowLeft, ScanLine, ChevronDown, ChevronRight,
  CheckCircle2, Circle,
} from 'lucide-react-native'
import { api, OfflineError } from '@/lib/api'
import { enqueue, incrementSessionCount } from '@/lib/offline'
import { QRScanner } from '@/components/QRScanner'
import { theme, spacing, radius } from '@/lib/theme'
import type { Route, RouteStopBarrel, RouteStop, BarrelScanResult } from '@/lib/types'

type ListItem =
  | { type: 'stop_header'; stop: RouteStop; isExpanded: boolean }
  | { type: 'barrel'; barrel: RouteStopBarrel; stopId: string }

function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <View style={toastStyles.container}>
      <Text style={toastStyles.text}>{message}</Text>
    </View>
  )
}
const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(249,115,22,0.95)',
    borderRadius: radius.sm,
    padding: spacing.md,
    alignItems: 'center',
    zIndex: 100,
  },
  text: { color: '#fff', fontWeight: '600', fontSize: 14 },
})

export default function AlistamientoDetailScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>()
  const router = useRouter()

  const [route, setRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(true)
  const [scannerVisible, setScannerVisible] = useState(false)
  const [scannedBarrels, setScannedBarrels] = useState<Set<string>>(new Set())
  const [expandedStops, setExpandedStops] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const toastRef = useRef<ReturnType<typeof setTimeout>>()

  function showToast(msg: string) {
    clearTimeout(toastRef.current)
    setToast(msg)
    toastRef.current = setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    api.get<{ data: Route }>(`/api/rutas/${routeId}`)
      .then(res => {
        setRoute(res.data)
        // Expand all stops by default
        const ids = new Set(res.data.stops?.map(s => s.id) ?? [])
        setExpandedStops(ids)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [routeId])

  const allBarrelIds = useMemo(
    () =>
      new Set(
        route?.stops?.flatMap(s => s.barrels?.map(b => b.barrelId) ?? []) ?? []
      ),
    [route]
  )

  const allScanned = allBarrelIds.size > 0 && scannedBarrels.size >= allBarrelIds.size

  const listData = useMemo<ListItem[]>(() => {
    if (!route?.stops) return []
    const items: ListItem[] = []
    for (const stop of route.stops) {
      const isExpanded = expandedStops.has(stop.id)
      items.push({ type: 'stop_header', stop, isExpanded })
      if (isExpanded) {
        for (const barrel of stop.barrels ?? []) {
          items.push({ type: 'barrel', barrel, stopId: stop.id })
        }
      }
    }
    return items
  }, [route?.stops, expandedStops])

  function toggleStop(stopId: string) {
    setExpandedStops(prev => {
      const next = new Set(prev)
      if (next.has(stopId)) next.delete(stopId)
      else next.add(stopId)
      return next
    })
  }

  function handleScanResult(result: BarrelScanResult, action: string) {
    if (action === 'cancel') return
    const barrelId = result.barrel.id
    if (!allBarrelIds.has(barrelId)) {
      showToast('⚠️ Este barril no pertenece a esta ruta')
      return
    }
    if (scannedBarrels.has(barrelId)) {
      showToast('Ya fue escaneado')
      return
    }
    setScannedBarrels(prev => new Set([...prev, barrelId]))
    incrementSessionCount()
    setScannerVisible(false)
  }

  async function confirmSalida() {
    if (!route || confirming) return
    setConfirming(true)
    try {
      await api.post(`/api/rutas/${route.id}/iniciar`)
      router.back()
    } catch (err) {
      if (err instanceof OfflineError) {
        enqueue(`/api/rutas/${route.id}/iniciar`, 'POST', {})
        router.back()
      } else {
        const e = err as { message?: string }
        showToast(e?.message ?? 'Error al confirmar salida')
      }
    } finally {
      setConfirming(false)
    }
  }

  if (loading || !route) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={theme.amber} style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  const scannedCount = scannedBarrels.size
  const totalCount = allBarrelIds.size
  const progress = totalCount > 0 ? scannedCount / totalCount : 0

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.routeName} numberOfLines={1}>{route.name}</Text>
          <Text style={styles.routeMeta}>
            {route.transportist?.name ?? ''} •{' '}
            {new Date(route.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Barriles escaneados</Text>
          <Text style={styles.progressCount}>{scannedCount} / {totalCount}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as `${number}%` }]} />
        </View>
      </View>

      {/* Stops + barrels list */}
      <FlashList
        data={listData}
        estimatedItemSize={56}
        keyExtractor={(item, i) =>
          item.type === 'stop_header' ? item.stop.id : `${item.stopId}-${item.barrel.barrelId}-${i}`
        }
        renderItem={({ item }) => {
          if (item.type === 'stop_header') {
            const { stop, isExpanded } = item
            const stopScanned = (stop.barrels ?? []).filter(b => scannedBarrels.has(b.barrelId)).length
            const stopTotal = (stop.barrels ?? []).length
            return (
              <TouchableOpacity
                style={styles.stopHeader}
                onPress={() => toggleStop(stop.id)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopName}>{stop.deliveryPoint?.name ?? stop.deliveryPointId}</Text>
                  <Text style={styles.stopCount}>{stopScanned}/{stopTotal} barriles</Text>
                </View>
                {isExpanded
                  ? <ChevronDown size={18} color={theme.textSecondary} />
                  : <ChevronRight size={18} color={theme.textSecondary} />
                }
              </TouchableOpacity>
            )
          }

          const { barrel } = item
          const isScanned = scannedBarrels.has(barrel.barrelId)
          return (
            <View style={styles.barrelRow}>
              {isScanned
                ? <CheckCircle2 size={20} color={theme.amber} />
                : <Circle size={20} color={theme.border} />
              }
              <Text style={[styles.barrelId, isScanned && styles.barrelIdScanned]}>
                {barrel.barrel?.id ?? barrel.barrelId}
              </Text>
              <Text style={styles.barrelProduct}>{barrel.product}</Text>
            </View>
          )
        }}
        contentContainerStyle={styles.list}
      />

      {/* FAB scan button */}
      <TouchableOpacity style={styles.fab} onPress={() => setScannerVisible(true)}>
        <ScanLine size={26} color="#000" />
      </TouchableOpacity>

      {/* Confirm sticky bottom */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.confirmBtn, !allScanned && styles.confirmBtnDisabled]}
          onPress={confirmSalida}
          disabled={!allScanned || confirming}
          activeOpacity={0.8}
        >
          {confirming
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.confirmBtnText}>Confirmar Salida →</Text>
          }
        </TouchableOpacity>
      </View>

      <Toast message={toast} />

      {/* Scanner modal */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <QRScanner
          context="alistamiento"
          onResult={handleScanResult}
          onClose={() => setScannerVisible(false)}
        />
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { padding: 4 },
  routeName: { fontSize: 16, fontWeight: 'bold', color: theme.text },
  routeMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  progressSection: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: { color: theme.textSecondary, fontSize: 13 },
  progressCount: { color: theme.text, fontSize: 13, fontWeight: '600' },
  progressTrack: {
    height: 6,
    backgroundColor: theme.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: theme.amber,
    borderRadius: 3,
  },
  list: { paddingBottom: 140 },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  stopName: { color: theme.text, fontWeight: '600', fontSize: 14 },
  stopCount: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
  barrelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginHorizontal: spacing.md,
  },
  barrelId: { color: theme.text, fontSize: 14, fontWeight: '500', flex: 1 },
  barrelIdScanned: { color: theme.amber },
  barrelProduct: { color: theme.textSecondary, fontSize: 13 },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.amber,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  confirmBtn: {
    height: 56,
    backgroundColor: theme.amber,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.35 },
  confirmBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
})
```

- [ ] **Step 14.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 15 — Recepcion screen

**Files:**
- Create: `src/app/(bodega)/recepcion.tsx`

- [ ] **Step 15.1 — Create `src/app/(bodega)/recepcion.tsx`**

```typescript
import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Package } from 'lucide-react-native'
import { api, OfflineError } from '@/lib/api'
import { enqueue, incrementSessionCount } from '@/lib/offline'
import { QRScanner } from '@/components/QRScanner'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
import { theme, spacing, radius } from '@/lib/theme'
import type { BarrelScanResult, Barrel } from '@/lib/types'

export default function RecepcionScreen() {
  const router = useRouter()
  const [received, setReceived] = useState<Barrel[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleResult(result: BarrelScanResult, action: string) {
    if (action === 'cancel') return
    const barrel = result.barrel
    setErrorMsg(null)
    try {
      await api.post(`/api/barriles/${barrel.id}/recibir`, {})
      setReceived(prev => [barrel, ...prev.filter(b => b.id !== barrel.id)])
      incrementSessionCount()
    } catch (err) {
      if (err instanceof OfflineError) {
        enqueue(`/api/barriles/${barrel.id}/recibir`, 'POST', {})
        setReceived(prev => [barrel, ...prev.filter(b => b.id !== barrel.id)])
        incrementSessionCount()
      } else {
        const e = err as { message?: string }
        setErrorMsg(e?.message ?? 'Error al recibir barril')
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Recepción de Barriles</Text>
      </View>

      {/* Scanner (top half) */}
      <View style={styles.scannerContainer}>
        <QRScanner context="recepcion" onResult={handleResult} onClose={() => router.back()} />
      </View>

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {/* Received list */}
      <View style={styles.listSection}>
        <Text style={styles.listTitle}>
          Recibidos en esta sesión ({received.length})
        </Text>
        <FlatList
          data={received}
          keyExtractor={b => b.id}
          ListEmptyComponent={
            <View style={styles.emptyRow}>
              <Package size={24} color={theme.border} />
              <Text style={styles.emptyText}>Escanea un barril para recibirlo</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.barrelCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.barrelId}>{item.id}</Text>
                {item.product && (
                  <Text style={styles.barrelProduct}>{item.product}</Text>
                )}
              </View>
              <BarrelStatusBadge status={item.status} />
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: theme.text },
  scannerContainer: { height: 320 },
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.9)',
    padding: spacing.sm,
    margin: spacing.md,
    borderRadius: radius.sm,
  },
  errorText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  listSection: { flex: 1, padding: spacing.md },
  listTitle: {
    color: theme.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  emptyRow: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyText: { color: theme.textSecondary, fontSize: 14 },
  barrelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: spacing.sm,
  },
  barrelId: { color: theme.text, fontWeight: '600', fontSize: 15 },
  barrelProduct: { color: theme.textSecondary, fontSize: 13, marginTop: 2 },
})
```

- [ ] **Step 15.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 16 — Alertas screen

**Files:**
- Create: `src/app/(bodega)/alertas.tsx`

- [ ] **Step 16.1 — Create `src/app/(bodega)/alertas.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { api } from '@/lib/api'
import { theme, spacing, radius } from '@/lib/theme'
import type { Alert, PaginatedResponse } from '@/lib/types'

const SEV_BORDER: Record<string, string> = {
  CRITICAL: '#ef4444',
  WARNING: '#f97316',
  INFO: theme.border,
}

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  if (hours < 24) return `hace ${hours} h`
  return `hace ${days} d`
}

export default function AlertasScreen() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchAlerts() {
    try {
      const data = await api.get<PaginatedResponse<Alert>>('/api/alertas?pageSize=50')
      const sorted = [...data.items].sort(
        (a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99)
      )
      setAlerts(sorted)
    } catch {
      // show empty
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchAlerts() }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchAlerts()
  }, [])

  async function markRead(id: string) {
    try {
      await api.patch(`/api/alertas/${id}/leer`)
      setAlerts(prev =>
        prev.map(a => (a.id === id ? { ...a, isRead: true } : a))
      )
    } catch {
      // silently fail
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={theme.amber} style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Alertas</Text>
        <Text style={styles.subtitle}>
          {alerts.filter(a => !a.isRead).length} sin leer
        </Text>
      </View>

      <FlashList
        data={alerts}
        estimatedItemSize={80}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.amber}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Sin alertas</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.alertCard,
              { borderLeftColor: SEV_BORDER[item.severity] ?? theme.border },
              item.isRead && styles.alertRead,
            ]}
            onPress={() => !item.isRead && markRead(item.id)}
            activeOpacity={item.isRead ? 1 : 0.7}
          >
            <Text style={styles.alertMsg}>{item.message}</Text>
            <View style={styles.alertMeta}>
              <Text style={styles.alertTime}>{timeAgo(item.createdAt)}</Text>
              {!item.isRead && (
                <View style={styles.unreadDot} />
              )}
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.text },
  subtitle: { color: theme.textSecondary, fontSize: 13 },
  list: { padding: spacing.md },
  alertCard: {
    backgroundColor: theme.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    borderLeftWidth: 4,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  alertRead: { opacity: 0.5 },
  alertMsg: { color: theme.text, fontSize: 14, lineHeight: 20 },
  alertMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  alertTime: { color: theme.textSecondary, fontSize: 12 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.amber,
  },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { color: theme.textSecondary, fontSize: 15 },
})
```

- [ ] **Step 16.2 — Type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: no errors.

---

## Task 17 — Final verification

**Files:** none created

- [ ] **Step 17.1 — Full type-check**

```bash
pnpm --filter mobile run type-check
```
Expected: `Found 0 errors.`

- [ ] **Step 17.2 — Start web build**

```bash
cd apps/mobile && npx expo start --web
```
Expected: Metro bundler starts, browser opens at `http://localhost:8081`

Verify in browser:
1. `/` redirects to `/(auth)/login` — shows dark login screen with amber BBC logo
2. Login form has email + password fields + amber button
3. No red console errors

- [ ] **Step 17.3 — Start tunnel for physical device**

```bash
cd apps/mobile && npx expo start --tunnel
```
Expected: QR code printed in terminal. Scan with Expo Go on phone.

Verify on device:
1. Login screen appears
2. After login, Tabs appear (Inicio / Escanear / Alertas)
3. Tap "Escanear" tab — camera permission prompt appears
4. Grant permission — camera view shows with amber scan frame
5. Scan a QR code (any QR) — haptic fires, BottomSheet slides up with barrel info or API error

- [ ] **Step 17.4 — Commit**

```bash
cd ../..  # monorepo root
git add apps/mobile/
git commit -m "feat(mobile): implement Operario de Bodega screens

- Auth flow with SecureStore JWT tokens
- QRScanner with CameraView + web TextInput fallback
- Home dashboard with action grid and session counter
- Alistamiento workflow: scan barrels, confirm salida
- Recepción de barriles with running session list
- Alertas grouped by severity
- MMKV offline queue with NetInfo drain on reconnect
"
```
