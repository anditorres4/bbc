import { useEffect, useState, useMemo, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal,
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

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Barriles escaneados</Text>
          <Text style={styles.progressCount}>{scannedCount} / {totalCount}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as `${number}%` }]} />
        </View>
      </View>

      <FlashList
        data={listData}
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

      <TouchableOpacity style={styles.fab} onPress={() => setScannerVisible(true)}>
        <ScanLine size={26} color="#000" />
      </TouchableOpacity>

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
