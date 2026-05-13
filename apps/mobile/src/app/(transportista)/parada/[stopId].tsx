import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import * as Location from 'expo-location'
import {
  ArrowLeft, MapPin, Package, RefreshCw, ScanLine,
  CheckCircle2, Circle, AlertTriangle,
} from 'lucide-react-native'
import { api, OfflineError } from '@/lib/api'
import { QRScanner } from '@/components/QRScanner'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
import { theme, spacing, radius } from '@/lib/theme'
import type { RouteStop, BarrelScanResult } from '@/lib/types'

type GpsCoords = { lat: number; lng: number } | null
type ScanMode = 'entrega' | 'recogida_vacio'

function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <View style={toastS.wrap}>
      <Text style={toastS.text}>{message}</Text>
    </View>
  )
}
const toastS = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 110,
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

export default function ParadaDetailScreen() {
  const { stopId, routeId } = useLocalSearchParams<{ stopId: string; routeId: string }>()
  const router = useRouter()

  const [stop, setStop] = useState<RouteStop | null>(null)
  const [loading, setLoading] = useState(true)
  const [gps, setGps] = useState<GpsCoords>(null)
  const [gpsLoading, setGpsLoading] = useState(true)
  const [scanMode, setScanMode] = useState<ScanMode>('entrega')
  const [scannerVisible, setScannerVisible] = useState(false)
  const [novedadVisible, setNovedadVisible] = useState(false)
  const [novedadText, setNovedadText] = useState('')
  const [novedadLoading, setNovedadLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  function showToast(msg: string) {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  async function loadStop(silent = false) {
    if (!silent) setLoading(true)
    try {
      const res = await api.get<{ data: RouteStop }>(`/api/rutas/${routeId}/stops/${stopId}`)
      setStop(res.data)
    } catch {
      showToast('Error al cargar la parada')
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(
    useCallback(() => { loadStop(true) }, [stopId, routeId])
  )

  useEffect(() => {
    async function requestGPS() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') return
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        setGps({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      } catch { /* continue without GPS */ } finally {
        setGpsLoading(false)
      }
    }
    requestGPS()
  }, [])

  const pendingBarrels = stop?.barrels?.filter(b => b.status === 'ASIGNADO') ?? []
  const deliveredBarrels = stop?.barrels?.filter(b => b.status === 'ENTREGADO') ?? []
  const pickedUpBarrels = stop?.barrels?.filter(b => b.status === 'RECOGIDO_VACIO') ?? []
  const allConfirmed = pendingBarrels.length === 0 && (stop?.barrels?.length ?? 0) > 0

  async function handleScanResult(result: BarrelScanResult, action: string) {
    if (action === 'cancel') {
      setScannerVisible(false)
      return
    }

    try {
      if (scanMode === 'entrega' && action === 'entregar') {
        const inStop = stop?.barrels?.some(b => b.barrelId === result.barrel.id)
        if (!inStop) {
          showToast('Este barril no está asignado a este punto')
          setScannerVisible(false)
          return
        }
        await api.post(`/api/rutas/${routeId}/stops/${stopId}/entregar`, {
          barrelIds: [result.barrel.id],
          lat: gps?.lat ?? null,
          lng: gps?.lng ?? null,
        })
      } else if (scanMode === 'recogida_vacio' && action === 'recoger') {
        await api.post(`/api/rutas/${routeId}/stops/${stopId}/recoger`, {
          barrelId: result.barrel.id,
          lat: gps?.lat ?? null,
          lng: gps?.lng ?? null,
        })
      }
      setScannerVisible(false)
      await loadStop(true)
    } catch (err) {
      if (err instanceof OfflineError) {
        showToast('Sin conexión — intenta cuando haya red')
      } else {
        const e = err as { message?: string }
        showToast(e?.message ?? 'Error al registrar')
      }
      setScannerVisible(false)
    }
  }

  async function submitNovedad() {
    if (!novedadText.trim() || novedadLoading) return
    setNovedadLoading(true)
    try {
      await api.post(`/api/rutas/${routeId}/stops/${stopId}/novedad`, {
        description: novedadText.trim(),
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
      })
      setNovedadVisible(false)
      setNovedadText('')
      await loadStop(true)
    } catch (err) {
      const e = err as { message?: string }
      showToast(e?.message ?? 'Error al registrar novedad')
    } finally {
      setNovedadLoading(false)
    }
  }

  async function completarParada() {
    if (!stop || confirming) return
    setConfirming(true)
    try {
      await api.post(`/api/rutas/${routeId}/stops/${stopId}/completar`, {
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
      })
      router.back()
    } catch (err) {
      const e = err as { message?: string }
      showToast(e?.message ?? 'Error al completar parada')
    } finally {
      setConfirming(false)
    }
  }

  if (loading || !stop) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={theme.amber} style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  const dpName = stop.deliveryPoint?.name ?? `Parada ${stop.position}`
  const dpAddr = stop.deliveryPoint?.address ?? ''

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{dpName}</Text>
          {dpAddr ? <Text style={styles.headerAddr} numberOfLines={1}>{dpAddr}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => loadStop(true)} style={styles.reloadBtn}>
          <RefreshCw size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* GPS widget */}
      <View style={styles.gpsRow}>
        <MapPin size={14} color={gps ? theme.green : theme.textSecondary} />
        <Text style={[styles.gpsText, { color: gps ? theme.green : theme.textSecondary }]}>
          {gpsLoading
            ? 'GPS: buscando...'
            : gps
            ? `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
            : 'GPS: no disponible'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        {/* Barriles a entregar */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Package size={16} color={theme.amber} />
            <Text style={styles.sectionTitle}>Barriles a entregar</Text>
            <Text style={styles.sectionCount}>
              {deliveredBarrels.length}/{stop.totalBarrels}
            </Text>
          </View>

          {(stop.barrels ?? []).map(barrel => {
            const isDone = barrel.status === 'ENTREGADO' || barrel.status === 'RECOGIDO_VACIO'
            const isNovedad = barrel.status === 'NOVEDAD'
            return (
              <View key={barrel.id} style={styles.barrelRow}>
                {isDone
                  ? <CheckCircle2 size={20} color={theme.green} />
                  : isNovedad
                  ? <AlertTriangle size={20} color={theme.orange} />
                  : <Circle size={20} color={theme.border} />
                }
                <View style={{ flex: 1 }}>
                  <Text style={[styles.barrelId, isDone && styles.barrelIdDone]}>
                    {barrel.barrel?.id ?? barrel.barrelId}
                  </Text>
                  <Text style={styles.barrelProduct}>{barrel.product}</Text>
                </View>
                <BarrelStatusBadge status={barrel.status as never} />
                {barrel.status === 'ASIGNADO' && (
                  <TouchableOpacity
                    style={styles.scanBtn}
                    onPress={() => {
                      setScanMode('entrega')
                      setScannerVisible(true)
                    }}
                  >
                    <ScanLine size={16} color="#000" />
                  </TouchableOpacity>
                )}
              </View>
            )
          })}

          {(stop.barrels ?? []).length === 0 && (
            <Text style={styles.emptySection}>Sin barriles asignados</Text>
          )}
        </View>

        {/* Vacíos a recoger */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Package size={16} color={theme.textSecondary} />
            <Text style={styles.sectionTitle}>Vacíos a recoger</Text>
            <Text style={styles.sectionCount}>{pickedUpBarrels.length} recogidos</Text>
          </View>

          <TouchableOpacity
            style={styles.pickupBtn}
            onPress={() => {
              setScanMode('recogida_vacio')
              setScannerVisible(true)
            }}
          >
            <ScanLine size={18} color={theme.text} />
            <Text style={styles.pickupBtnText}>Escanear vacío</Text>
          </TouchableOpacity>
        </View>

        {/* Registrar novedad */}
        <TouchableOpacity
          style={styles.novedadBtn}
          onPress={() => setNovedadVisible(true)}
        >
          <AlertTriangle size={18} color={theme.orange} />
          <Text style={styles.novedadBtnText}>Registrar novedad</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sticky bottom: Completar Parada */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.completarBtn, !allConfirmed && styles.completarBtnDisabled]}
          onPress={completarParada}
          disabled={!allConfirmed || confirming}
          activeOpacity={0.8}
        >
          {confirming
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.completarBtnText}>Completar Parada</Text>
          }
        </TouchableOpacity>
      </View>

      <Toast message={toast} />

      {/* QR Scanner modal */}
      <Modal
        visible={scannerVisible}
        animationType="slide"
        onRequestClose={() => setScannerVisible(false)}
      >
        <QRScanner
          context={scanMode}
          onResult={handleScanResult}
          onClose={() => setScannerVisible(false)}
        />
      </Modal>

      {/* Novedad modal */}
      <Modal
        visible={novedadVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setNovedadVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.novedadOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.novedadSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.novedadTitle}>Registrar novedad</Text>

            <TextInput
              style={styles.novedadInput}
              value={novedadText}
              onChangeText={setNovedadText}
              placeholder="Describe la novedad..."
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.novedadActions}>
              <TouchableOpacity
                style={styles.novedadCancel}
                onPress={() => { setNovedadVisible(false); setNovedadText('') }}
              >
                <Text style={styles.novedadCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.novedadSubmit, (!novedadText.trim() || novedadLoading) && styles.novedadSubmitDisabled]}
                onPress={submitNovedad}
                disabled={!novedadText.trim() || novedadLoading}
              >
                {novedadLoading
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={styles.novedadSubmitText}>Registrar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text },
  headerAddr: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  reloadBtn: { padding: 4 },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.card,
  },
  gpsText: { fontSize: 12 },
  scroll: { padding: spacing.md, paddingBottom: 120 },
  section: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sectionTitle: { flex: 1, color: theme.text, fontWeight: '600', fontSize: 14 },
  sectionCount: { color: theme.textSecondary, fontSize: 13 },
  barrelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  barrelId: { color: theme.text, fontSize: 14, fontWeight: '500' },
  barrelIdDone: { color: theme.textSecondary, textDecorationLine: 'line-through' },
  barrelProduct: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
  scanBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: theme.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  emptySection: {
    color: theme.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    padding: spacing.md,
  },
  pickupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    margin: spacing.md,
  },
  pickupBtnText: { color: theme.text, fontWeight: '600', fontSize: 14 },
  novedadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.orange,
  },
  novedadBtnText: { color: theme.orange, fontWeight: '600', fontSize: 14 },
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
  completarBtn: {
    height: 56,
    backgroundColor: theme.green,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completarBtnDisabled: { opacity: 0.35 },
  completarBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  // Novedad modal
  novedadOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  novedadSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  novedadTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: spacing.md,
  },
  novedadInput: {
    height: 100,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: theme.text,
    backgroundColor: theme.bg,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  novedadActions: { flexDirection: 'row', gap: spacing.sm },
  novedadCancel: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  novedadCancelText: { color: theme.text, fontWeight: '600' },
  novedadSubmit: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: theme.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  novedadSubmitDisabled: { opacity: 0.4 },
  novedadSubmitText: { color: '#000', fontWeight: 'bold' },
})
