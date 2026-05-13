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
      // show empty state
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
