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

export default function AlertasTransportista() {
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
    } catch { /* show empty */ } finally {
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
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a))
    } catch { /* silently fail */ }
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
              {!item.isRead && <View style={styles.unreadDot} />}
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
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.amber },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { color: theme.textSecondary, fontSize: 15 },
})
