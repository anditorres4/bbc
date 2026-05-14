import { useEffect, useState, useMemo, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, ScanLine, CheckCircle2, Package } from 'lucide-react-native'
import { api } from '@/lib/api'
import { incrementSessionCount } from '@/lib/offline'
import { QRScanner } from '@/components/QRScanner'
import { theme, spacing, radius } from '@/lib/theme'
import type { Route, BarrelScanResult } from '@/lib/types'

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
  // Map of barrelId → product for scanned barrels
  const [scannedBarrels, setScannedBarrels] = useState<Map<string, string>>(new Map())
  const [toast, setToast] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout>>()

  function showToast(msg: string) {
    clearTimeout(toastRef.current)
    setToast(msg)
    toastRef.current = setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    api.get<{ data: Route }>(`/api/rutas/${routeId}`)
      .then(res => setRoute(res.data))
      .catch(() => showToast('Error cargando ruta'))
      .finally(() => setLoading(false))
  }, [routeId])

  // Aggregate requirements by product across all stops
  const required = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>()
    for (const stop of route?.stops ?? []) {
      for (const req of stop.requirements ?? []) {
        map.set(req.product, (map.get(req.product) ?? 0) + req.quantity)
      }
    }
    return map
  }, [route])

  // Count scanned barrels by product
  const scannedByProduct = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>()
    for (const product of scannedBarrels.values()) {
      map.set(product, (map.get(product) ?? 0) + 1)
    }
    return map
  }, [scannedBarrels])

  const allRequirementsMet = useMemo(() => {
    if (required.size === 0) return false
    for (const [product, qty] of required.entries()) {
      if ((scannedByProduct.get(product) ?? 0) < qty) return false
    }
    return true
  }, [required, scannedByProduct])

  // Auto-close scanner once all requirements are satisfied
  useEffect(() => {
    if (allRequirementsMet && scannerVisible) {
      const t = setTimeout(() => setScannerVisible(false), 1600)
      return () => clearTimeout(t)
    }
  }, [allRequirementsMet, scannerVisible])

  const totalRequired = useMemo(
    () => Array.from(required.values()).reduce((s, n) => s + n, 0),
    [required]
  )
  const totalScanned = scannedBarrels.size
  const progress = totalRequired > 0 ? totalScanned / totalRequired : 0

  function handleScanResult(result: BarrelScanResult, action: string) {
    if (action === 'cancel') return
    const barrelId = result.barrel.id
    const product = result.barrel.product ?? ''

    if (scannedBarrels.has(barrelId)) {
      showToast('Este barril ya fue escaneado')
      return
    }

    if (!product) {
      showToast('⚠️ Este barril no tiene producto asignado')
      return
    }

    const requiredQty = required.get(product) ?? 0
    if (requiredQty === 0) {
      showToast(`⚠️ "${product}" no es requerido en esta ruta`)
      return
    }

    const alreadyScanned = scannedByProduct.get(product) ?? 0
    if (alreadyScanned >= requiredQty) {
      showToast(`Ya se escanearon todos los barriles de "${product}"`)
      return
    }

    setScannedBarrels(prev => new Map(prev).set(barrelId, product))
    incrementSessionCount()
    // Scanner stays open — closed automatically when all requirements are met
  }

  async function confirmSalida() {
    if (!route || confirming) return
    setConfirming(true)
    setError(null)
    try {
      await api.post(`/api/rutas/${route.id}/iniciar`, {
        barrelIds: Array.from(scannedBarrels.keys()),
      })
      router.back()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message ?? 'Error al iniciar ruta')
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

      {/* Overall progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Barriles escaneados</Text>
          <Text style={styles.progressCount}>{totalScanned} / {totalRequired}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` as `${number}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Requirements per product */}
        <Text style={styles.sectionTitle}>Requerimientos por producto</Text>
        {Array.from(required.entries()).map(([product, qty]) => {
          const scanned = scannedByProduct.get(product) ?? 0
          const done = scanned >= qty
          return (
            <View key={product} style={styles.productRow}>
              <View style={styles.productIcon}>
                {done
                  ? <CheckCircle2 size={20} color={theme.amber} />
                  : <Package size={20} color={theme.textSecondary} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{product}</Text>
                <View style={styles.productProgress}>
                  <View style={styles.productProgressTrack}>
                    <View
                      style={[
                        styles.productProgressFill,
                        { width: `${Math.min((scanned / qty) * 100, 100)}%` as `${number}%` },
                        done && styles.productProgressDone,
                      ]}
                    />
                  </View>
                </View>
              </View>
              <Text style={[styles.productCount, done && styles.productCountDone]}>
                {scanned}/{qty}
              </Text>
            </View>
          )
        })}

        {/* Scanned barrel list */}
        {scannedBarrels.size > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Barriles escaneados</Text>
            {Array.from(scannedBarrels.entries()).map(([barrelId, product]) => (
              <View key={barrelId} style={styles.barrelRow}>
                <CheckCircle2 size={16} color={theme.amber} />
                <Text style={styles.barrelId}>{barrelId}</Text>
                <Text style={styles.barrelProduct}>{product}</Text>
              </View>
            ))}
          </>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      {/* FAB scan button */}
      <TouchableOpacity style={styles.fab} onPress={() => setScannerVisible(true)}>
        <ScanLine size={26} color="#000" />
      </TouchableOpacity>

      {/* Bottom confirm bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.confirmBtn, !allRequirementsMet && styles.confirmBtnDisabled]}
          onPress={confirmSalida}
          disabled={!allRequirementsMet || confirming}
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
          autoConfirm
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
  scrollContent: { padding: spacing.md, paddingBottom: 140 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.card,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: theme.border,
  },
  productIcon: { width: 24, alignItems: 'center' },
  productName: { color: theme.text, fontSize: 14, fontWeight: '500', marginBottom: 6 },
  productProgress: { flexDirection: 'row', alignItems: 'center' },
  productProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  productProgressFill: {
    height: 4,
    backgroundColor: theme.amber,
    borderRadius: 2,
  },
  productProgressDone: { backgroundColor: '#22c55e' },
  productCount: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    minWidth: 36,
    textAlign: 'right',
  },
  productCountDone: { color: '#22c55e' },
  barrelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  barrelId: { color: theme.text, fontSize: 14, fontWeight: '500', flex: 1 },
  barrelProduct: { color: theme.textSecondary, fontSize: 13 },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.md,
  },
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
