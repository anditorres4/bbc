import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { MapPin, CheckCircle2, RefreshCw, LogOut } from 'lucide-react-native'
import { api } from '@/lib/api'
import { getRefreshToken, clearTokens } from '@/lib/auth'
import { theme, spacing, radius } from '@/lib/theme'
import type { Route } from '@/lib/types'

function StopStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    PENDIENTE: { label: 'Pendiente', color: theme.textSecondary },
    COMPLETADA: { label: 'Completada', color: theme.green },
    CON_NOVEDAD: { label: 'Novedad', color: theme.orange },
    CANCELADA: { label: 'Cancelada', color: theme.red },
  }
  const { label, color } = map[status] ?? { label: status, color: theme.textSecondary }
  return (
    <View style={[badgeS.wrap, { borderColor: color }]}>
      <Text style={[badgeS.text, { color }]}>{label}</Text>
    </View>
  )
}

const badgeS = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontSize: 11, fontWeight: '600' },
})

export default function MiRutaScreen() {
  const router = useRouter()
  const [route, setRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [pulseAnim])

  async function loadRoute(silent = false) {
    if (!silent) setLoading(true)
    setErrorMsg(null)
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await api.get<{ data: Route[] }>(
        `/api/rutas?transportistaId=me&date=${today}&status=PLANIFICADA,EN_CURSO`
      )
      setRoute(res.data?.[0] ?? null)
    } catch {
      setErrorMsg('No se pudo cargar la ruta')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(
    useCallback(() => { loadRoute(true) }, [])
  )

  async function handleLogout() {
    try {
      const refreshToken = await getRefreshToken()
      if (refreshToken) await api.post('/auth/logout', { refreshToken })
    } catch { /* ignore */ }
    await clearTokens()
    router.replace('/(auth)/login')
  }

  async function iniciarRuta() {
    if (!route || starting) return
    setStarting(true)
    try {
      await api.post(`/api/rutas/${route.id}/iniciar`)
      await loadRoute(true)
    } catch (err) {
      const e = err as { message?: string }
      setErrorMsg(e?.message ?? 'Error al iniciar ruta')
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={theme.amber} style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  const stops = route?.stops ?? []
  const completedCount = stops.filter(s => s.status === 'COMPLETADA').length
  const totalCount = stops.length
  const progress = totalCount > 0 ? completedCount / totalCount : 0
  const activeStopIndex = route?.status === 'EN_CURSO'
    ? stops.findIndex(s => s.status !== 'COMPLETADA' && s.status !== 'CANCELADA')
    : -1

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MapPin size={20} color={theme.amber} />
          <Text style={styles.title}>Mi Ruta</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <LogOut size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {!route ? (
        <View style={styles.emptyState}>
          <MapPin size={64} color={theme.border} />
          <Text style={styles.emptyTitle}>Sin ruta asignada</Text>
          <Text style={styles.emptyText}>No tienes ruta asignada para hoy</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => loadRoute()}>
            <RefreshCw size={18} color={theme.amber} />
            <Text style={styles.refreshBtnText}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.routeHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeName}>{route.name}</Text>
              <Text style={styles.routeMeta}>
                {new Date(route.date).toLocaleDateString('es-CO', {
                  day: 'numeric',
                  month: 'long',
                })}
                {route.vehiclePlate ? ` • ${route.vehiclePlate}` : ''}
              </Text>
            </View>
          </View>

          {route.status === 'EN_CURSO' && (
            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>
                  {completedCount}/{totalCount} paradas completadas
                </Text>
                <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progress * 100}%` as `${number}%` },
                  ]}
                />
              </View>
            </View>
          )}

          {route.status === 'PLANIFICADA' && (
            <View style={styles.startContainer}>
              <TouchableOpacity
                style={[styles.startBtn, starting && styles.startBtnDisabled]}
                onPress={iniciarRuta}
                disabled={starting}
                activeOpacity={0.8}
              >
                {starting
                  ? <ActivityIndicator color="#000" />
                  : <Text style={styles.startBtnText}>INICIAR RUTA</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          <FlashList
            data={stops}
            keyExtractor={item => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); loadRoute(true) }}
                tintColor={theme.amber}
              />
            }
            renderItem={({ item, index }) => {
              const isCompleted = item.status === 'COMPLETADA'
              const isActive = index === activeStopIndex

              return (
                <TouchableOpacity
                  style={[styles.stopCard, isCompleted && styles.stopCardDone]}
                  onPress={() =>
                    route.status === 'EN_CURSO' &&
                    router.push(
                      `/(transportista)/parada/${item.id}?routeId=${route.id}` as never
                    )
                  }
                  activeOpacity={0.75}
                  disabled={route.status !== 'EN_CURSO'}
                >
                  {isActive && (
                    <Animated.View
                      style={[styles.activePulse, { opacity: pulseAnim }]}
                      pointerEvents="none"
                    />
                  )}

                  <View
                    style={[
                      styles.stopBullet,
                      isCompleted && styles.stopBulletDone,
                      isActive && styles.stopBulletActive,
                    ]}
                  >
                    {isCompleted
                      ? <CheckCircle2 size={16} color={theme.green} />
                      : <Text style={[styles.stopNum, isActive && styles.stopNumActive]}>
                          {index + 1}
                        </Text>
                    }
                  </View>

                  <View style={styles.stopBody}>
                    <Text
                      style={[styles.stopName, isCompleted && styles.stopNameDone]}
                      numberOfLines={1}
                    >
                      {item.deliveryPoint?.name ?? `Parada ${index + 1}`}
                    </Text>
                    {item.deliveryPoint?.address ? (
                      <Text style={styles.stopAddr} numberOfLines={1}>
                        {item.deliveryPoint.address}
                      </Text>
                    ) : null}
                    <View style={styles.stopMeta}>
                      <Text style={styles.stopMetaTxt}>{item.totalBarrels} barriles</Text>
                      <StopStatusBadge status={item.status} />
                    </View>
                  </View>

                  {isActive && (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </TouchableOpacity>
              )
            }}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoutBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.text },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  emptyText: { color: theme.textSecondary, textAlign: 'center' },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: theme.amber,
    borderRadius: radius.sm,
  },
  refreshBtnText: { color: theme.amber, fontWeight: '600' },
  routeHeader: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  routeName: { fontSize: 16, fontWeight: 'bold', color: theme.text },
  routeMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  progressSection: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: { color: theme.textSecondary, fontSize: 13 },
  progressPct: { color: theme.text, fontSize: 13, fontWeight: '600' },
  progressTrack: { height: 6, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: theme.amber, borderRadius: 3 },
  startContainer: { padding: spacing.md },
  startBtn: {
    height: 64,
    backgroundColor: theme.amber,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnDisabled: { opacity: 0.6 },
  startBtnText: { color: '#000', fontWeight: 'bold', fontSize: 18, letterSpacing: 0.5 },
  errorText: { color: theme.red, fontSize: 13, textAlign: 'center', padding: spacing.sm },
  list: { padding: spacing.md, paddingBottom: 32 },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: spacing.sm,
    padding: spacing.md,
    overflow: 'hidden',
  },
  stopCardDone: { opacity: 0.55 },
  activePulse: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.amber,
    borderRadius: radius.md,
  },
  stopBullet: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stopBulletDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.green },
  stopBulletActive: { backgroundColor: theme.amber },
  stopNum: { color: theme.text, fontWeight: '700', fontSize: 13 },
  stopNumActive: { color: '#000' },
  stopBody: { flex: 1 },
  stopName: { color: theme.text, fontWeight: '600', fontSize: 14 },
  stopNameDone: { textDecorationLine: 'line-through', color: theme.textSecondary },
  stopAddr: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
  stopMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  stopMetaTxt: { color: theme.textSecondary, fontSize: 12 },
  chevron: { fontSize: 26, color: theme.amber, fontWeight: '300', marginLeft: spacing.sm },
})
