import { useState, useCallback } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronRight, CheckCircle2, MapPin, User, ArrowLeft } from 'lucide-react-native'
import { api } from '@/lib/api'
import { theme, spacing, radius } from '@/lib/theme'
import type { Route, PaginatedResponse } from '@/lib/types'

function RouteCard({ route }: { route: Route }) {
  const router = useRouter()
  const isReady = route.status === 'EN_CURSO'

  return (
    <TouchableOpacity
      style={[styles.card, isReady && styles.cardReady]}
      onPress={isReady ? undefined : () => router.push(`/(bodega)/alistamiento/${route.id}` as never)}
      activeOpacity={isReady ? 1 : 0.75}
      disabled={isReady}
    >
      <View style={styles.cardRow}>
        <Text style={[styles.routeName, isReady && styles.routeNameReady]} numberOfLines={1}>
          {route.name}
        </Text>
        {isReady ? (
          <View style={styles.readyBadge}>
            <CheckCircle2 size={14} color="#16a34a" />
            <Text style={styles.readyBadgeText}>Alistada</Text>
          </View>
        ) : (
          <ChevronRight size={18} color={theme.textSecondary} />
        )}
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
  )
}

export default function AlistamientoListScreen() {
  const router = useRouter()
  const [pending, setPending] = useState<Route[]>([])
  const [prepared, setPrepared] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchRoutes() {
    try {
      const [planificadas, enCurso] = await Promise.all([
        api.get<PaginatedResponse<Route>>('/api/rutas?status=PLANIFICADA&pageSize=50'),
        api.get<PaginatedResponse<Route>>('/api/rutas?status=EN_CURSO&pageSize=50'),
      ])
      setPending(planificadas.items)
      setPrepared(enCurso.items)
    } catch {
      // show empty state
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(useCallback(() => {
    fetchRoutes()
  }, []))

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

  const isEmpty = pending.length === 0 && prepared.length === 0

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Rutas para Alistar</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.amber}
          />
        }
      >
        {isEmpty && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay rutas planificadas</Text>
          </View>
        )}

        {pending.length > 0 && (
          <>
            {prepared.length > 0 && (
              <Text style={styles.sectionLabel}>PENDIENTES ({pending.length})</Text>
            )}
            {pending.map(route => <RouteCard key={route.id} route={route} />)}
          </>
        )}

        {prepared.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, pending.length > 0 && { marginTop: spacing.md }]}>
              ALISTADAS ({prepared.length})
            </Text>
            {prepared.map(route => <RouteCard key={route.id} route={route} />)}
          </>
        )}
      </ScrollView>
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardReady: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    opacity: 0.85,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  routeName: { fontSize: 16, fontWeight: '600', color: theme.text, flex: 1 },
  routeNameReady: { color: '#15803d' },
  routeDate: { color: theme.textSecondary, fontSize: 13, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: theme.textSecondary, fontSize: 12 },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  readyBadgeText: { color: '#16a34a', fontSize: 12, fontWeight: '700' },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { color: theme.textSecondary, fontSize: 15 },
})
