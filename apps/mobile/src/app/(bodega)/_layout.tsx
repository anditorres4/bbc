import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { Tabs } from 'expo-router'
import { Home, ScanLine, Bell } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { theme, spacing } from '@/lib/theme'
import { useNetworkState } from '@/lib/network'
import { drainQueue, queueSize } from '@/lib/offline'
import { getAccessToken } from '@/lib/auth'
import { api } from '@/lib/api'
import type { Alert, PaginatedResponse } from '@/lib/types'

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'

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
  const [criticalMsg, setCriticalMsg] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const bannerY = useRef(new Animated.Value(-80)).current
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>()
  const active = useRef(true)

  function showBanner(message: string) {
    setCriticalMsg(message)
    Animated.spring(bannerY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
    clearTimeout(bannerTimer.current)
    bannerTimer.current = setTimeout(() => {
      Animated.timing(bannerY, { toValue: -80, duration: 300, useNativeDriver: true })
        .start(() => setCriticalMsg(null))
    }, 5000)
  }

  // SSE connection with polling fallback for critical alert banner
  useEffect(() => {
    active.current = true
    let pollTimer: ReturnType<typeof setTimeout>

    async function pollCritical() {
      try {
        const data = await api.get<{ items: Alert[] }>('/api/alertas?severity=CRITICAL&isRead=false&pageSize=5')
        const unread = data.items ?? []
        if (unread.length > 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          showBanner(unread[0]!.message)
        }
      } catch { /* silent */ }
      if (active.current) pollTimer = setTimeout(pollCritical, 30_000)
    }

    async function connectSSE() {
      try {
        const token = await getAccessToken()
        if (!token || !active.current) return

        const res = await fetch(`${BASE}/api/alertas/stream`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.body) {
          pollCritical()
          return
        }
        if (!active.current) return

        const reader = res.body.getReader()
        const dec = new TextDecoder()

        while (active.current) {
          const { done, value } = await reader.read()
          if (done) break
          const text = dec.decode(value)
          for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const alert = JSON.parse(line.slice(6)) as Alert
              if (alert.severity === 'CRITICAL') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
                showBanner(alert.message)
              }
            } catch { /* skip malformed */ }
          }
        }
      } catch {
        if (active.current) pollCritical()
      }
    }

    connectSSE()

    return () => {
      active.current = false
      clearTimeout(pollTimer)
      clearTimeout(bannerTimer.current)
    }
  }, [])

  // Separate effect for unread count badge — polls every 30s
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let unmounted = false

    async function fetchCount() {
      try {
        const data = await api.get<PaginatedResponse<Alert>>('/api/alertas?isRead=false&pageSize=1')
        if (!unmounted) setUnreadCount(data.total)
      } catch { /* silent */ }
      if (!unmounted) timer = setTimeout(fetchCount, 30_000)
    }

    fetchCount()
    return () => {
      unmounted = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <View style={{ flex: 1 }}>
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
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          }}
        />
        <Tabs.Screen name="recepcion" options={{ href: null }} />
        <Tabs.Screen name="alistamiento" options={{ href: null }} />
      </Tabs>

      {criticalMsg !== null && (
        <Animated.View
          style={[styles.banner, { transform: [{ translateY: bannerY }] }]}
          pointerEvents="none"
        >
          <Text style={styles.bannerText}>🚨 {criticalMsg}</Text>
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: theme.red,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  bannerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
})
