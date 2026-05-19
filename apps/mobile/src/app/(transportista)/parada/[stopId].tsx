import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import * as Location from 'expo-location'
import {
  ArrowLeft, MapPin, Package, RefreshCw, ScanLine,
  CheckCircle2, AlertTriangle,
} from 'lucide-react-native'
import { api } from '@/lib/api'
import { apiCall } from '@/lib/apiWithOffline'
import { QRScanner } from '@/components/QRScanner'
import { theme, spacing, radius } from '@/lib/theme'
import type { RouteStop, BarrelScanResult } from '@/lib/types'

type GpsCoords = { lat: number; lng: number } | null
type ScanMode = 'entrega' | 'recogida_vacio'
type NovedadMode = 'novedad' | 'no-entregable'

const NOVEDAD_TYPES = [
  { value: 'CLIENTE_AUSENTE',      label: 'Cliente ausente' },
  { value: 'BARRIL_DANADO',        label: 'Barril dañado' },
  { value: 'PRODUCTO_INCORRECTO',  label: 'Producto incorrecto' },
  { value: 'ACCIDENTE',            label: 'Accidente' },
  { value: 'OTRO',                 label: 'Otro' },
] as const

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
  const [novedadMode, setNovedadMode] = useState<NovedadMode>('novedad')
  const [novedadText, setNovedadText] = useState('')
  const [novedadType, setNovedadType] = useState<string>('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [comentario, setComentario] = useState('')
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

  const deliveredBarrels = stop?.barrels?.filter(b => b.status === 'ENTREGADO') ?? []
  const pickedUpBarrels = stop?.barrels?.filter(b => b.status === 'RECOGIDO_VACIO') ?? []

  // Count delivered per product for progress display
  const deliveredByProduct = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>()
    for (const b of deliveredBarrels) {
      map.set(b.product, (map.get(b.product) ?? 0) + 1)
    }
    return map
  }, [deliveredBarrels])

  const allDelivered = (stop?.barrelsDelivered ?? 0) >= (stop?.totalBarrels ?? 1) && (stop?.totalBarrels ?? 0) > 0

  // Delivery uses autoConfirm: must return string (rejection shown in scanner) or void (success).
  // Pickup uses the default sheet flow: shows a confirm button, closes after action.
  async function handleScanResult(result: BarrelScanResult, action: string): Promise<string | void> {
    if (action === 'cancel') {
      setScannerVisible(false)
      return
    }

    if (scanMode === 'entrega' && action === 'entregar') {
      const res = await apiCall(`/api/rutas/${routeId}/stops/${stopId}/entregar`, 'POST', {
        barrelIds: [result.barrel.id],
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
      })
      if (res.queued) {
        // Optimistic update so allDelivered can be computed locally
        setStop(prev => prev ? {
          ...prev,
          barrelsDelivered: prev.barrelsDelivered + 1,
          barrels: [
            ...(prev.barrels ?? []),
            {
              id: result.barrel.id,
              barrelId: result.barrel.id,
              product: result.barrel.product ?? '',
              status: 'ENTREGADO',
              deliveredAt: new Date().toISOString(),
              barrel: { id: result.barrel.id, qrCode: result.barrel.qrCode },
            },
          ],
        } : prev)
        return // void = success, scanner stays open
      } else if (res.error) {
        return res.error // string = rejection shown inside scanner
      } else {
        await loadStop(true) // refresh → allDelivered useEffect auto-closes when done
        return
      }
    } else if (scanMode === 'recogida_vacio' && action === 'recoger') {
      const res = await apiCall(`/api/rutas/${routeId}/stops/${stopId}/recoger`, 'POST', {
        barrelIds: [result.barrel.id],
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
      })
      if (res.queued) {
        showToast('Guardado localmente — se enviará al reconectar')
        // Optimistic update so the picked-up barrel appears immediately
        setStop(prev => prev ? {
          ...prev,
          barrels: [
            ...(prev.barrels ?? []),
            {
              id: result.barrel.id,
              barrelId: result.barrel.id,
              product: result.barrel.product ?? '',
              status: 'RECOGIDO_VACIO',
              barrel: { id: result.barrel.id, qrCode: result.barrel.qrCode },
            },
          ],
        } : prev)
      } else if (res.error) {
        showToast(res.error)
      } else {
        await loadStop(true)
      }
      setScannerVisible(false)
    }
  }

  // Auto-close delivery scanner once all required barrels are delivered
  useEffect(() => {
    if (allDelivered && scannerVisible && scanMode === 'entrega') {
      const t = setTimeout(() => setScannerVisible(false), 1600)
      return () => clearTimeout(t)
    }
  }, [allDelivered, scannerVisible, scanMode])

  function openNovedadModal(mode: NovedadMode) {
    setNovedadMode(mode)
    setNovedadText('')
    setNovedadType('')
    setComentario('')
    setDropdownOpen(false)
    setNovedadVisible(true)
  }

  function closeNovedadModal() {
    setNovedadVisible(false)
    setNovedadText('')
    setNovedadType('')
    setComentario('')
    setDropdownOpen(false)
  }

  async function submitNovedad() {
    if (!novedadText.trim() || novedadLoading) return
    setNovedadLoading(true)
    try {
      const res = await apiCall(`/api/rutas/${routeId}/stops/${stopId}/novedad`, 'POST', {
        description: novedadText.trim(),
        ...(novedadType ? { novedadType } : {}),
      })
      closeNovedadModal()
      if (res.queued) {
        showToast('Novedad guardada localmente — se enviará al reconectar')
      } else if (res.error) {
        showToast(res.error)
      } else {
        await loadStop(true)
      }
    } finally {
      setNovedadLoading(false)
    }
  }

  async function marcarNoEntregable() {
    if (novedadLoading) return
    setNovedadLoading(true)
    try {
      const res = await apiCall(
        `/api/rutas/${routeId}/paradas/${stopId}/no-entregable`,
        'PATCH',
        {
          ...(novedadType ? { novedadType } : {}),
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
        }
      )
      closeNovedadModal()
      if (res.queued) {
        showToast('Marcado como no entregable — se enviará al reconectar')
      } else if (res.error) {
        showToast(res.error)
      } else {
        await loadStop(true)
      }
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
  const totalRequired = stop.totalBarrels
  const pct = totalRequired > 0 ? stop.barrelsDelivered / totalRequired : 0

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

      {/* GPS + progress row */}
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
        {/* Overall delivery progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Barriles entregados</Text>
            <Text style={styles.progressCount}>{stop.barrelsDelivered}/{totalRequired}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(pct * 100, 100)}%` as `${number}%` }]} />
          </View>
        </View>

        {/* Requirements per product */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Package size={16} color={theme.amber} />
            <Text style={styles.sectionTitle}>Requerimientos</Text>
          </View>

          {(stop.requirements ?? []).map(req => {
            const delivered = deliveredByProduct.get(req.product) ?? 0
            const done = delivered >= req.quantity
            return (
              <View key={req.id} style={styles.reqRow}>
                <View style={styles.reqIcon}>
                  {done
                    ? <CheckCircle2 size={18} color={theme.green} />
                    : <Package size={18} color={theme.textSecondary} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reqProduct}>{req.product}</Text>
                  <View style={styles.reqProgressTrack}>
                    <View
                      style={[
                        styles.reqProgressFill,
                        { width: `${Math.min((delivered / req.quantity) * 100, 100)}%` as `${number}%` },
                        done && styles.reqProgressDone,
                      ]}
                    />
                  </View>
                </View>
                <Text style={[styles.reqCount, done && styles.reqCountDone]}>
                  {delivered}/{req.quantity}
                </Text>
              </View>
            )
          })}

          {(stop.requirements ?? []).length === 0 && (
            <Text style={styles.emptySection}>Sin requerimientos registrados</Text>
          )}

          {/* Scan to deliver */}
          {!allDelivered && (
            <TouchableOpacity
              style={styles.scanDeliverBtn}
              onPress={() => { setScanMode('entrega'); setScannerVisible(true) }}
            >
              <ScanLine size={20} color="#000" />
              <Text style={styles.scanDeliverBtnText}>Escanear barril para entregar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Delivered barrels list */}
        {deliveredBarrels.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <CheckCircle2 size={16} color={theme.green} />
              <Text style={styles.sectionTitle}>Barriles entregados</Text>
            </View>
            {deliveredBarrels.map(b => (
              <View key={b.id} style={styles.barrelRow}>
                <Text style={styles.barrelId}>{b.barrel?.id ?? b.barrelId}</Text>
                <Text style={styles.barrelProduct}>{b.product}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Vacíos a recoger */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Package size={16} color={theme.textSecondary} />
            <Text style={styles.sectionTitle}>Vacíos a recoger</Text>
            <Text style={styles.sectionCount}>{pickedUpBarrels.length} recogidos</Text>
          </View>

          {pickedUpBarrels.map(b => (
            <View key={b.id} style={styles.barrelRow}>
              <CheckCircle2 size={16} color={theme.textSecondary} />
              <Text style={styles.barrelId}>{b.barrel?.id ?? b.barrelId}</Text>
              <Text style={styles.barrelProduct}>{b.product}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={styles.pickupBtn}
            onPress={() => { setScanMode('recogida_vacio'); setScannerVisible(true) }}
          >
            <ScanLine size={18} color={theme.text} />
            <Text style={styles.pickupBtnText}>Escanear vacío</Text>
          </TouchableOpacity>
        </View>

        {/* Registrar novedad */}
        <TouchableOpacity
          style={styles.novedadBtn}
          onPress={() => openNovedadModal('novedad')}
        >
          <AlertTriangle size={18} color={theme.orange} />
          <Text style={styles.novedadBtnText}>Registrar novedad</Text>
        </TouchableOpacity>

        {/* Punto no entregable */}
        <TouchableOpacity
          style={styles.noEntregableBtn}
          onPress={() => openNovedadModal('no-entregable')}
        >
          <AlertTriangle size={18} color="#fff" />
          <Text style={styles.noEntregableBtnText}>Punto no entregable</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sticky bottom: Completar Parada */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.completarBtn, !allDelivered && styles.completarBtnDisabled]}
          onPress={completarParada}
          disabled={!allDelivered || confirming}
          activeOpacity={0.8}
        >
          {confirming
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.completarBtnText}>Completar Parada</Text>
          }
        </TouchableOpacity>
      </View>

      <Toast message={toast} />

      {/* QR Scanner modal — delivery uses autoConfirm (stays open for next scan) */}
      <Modal
        visible={scannerVisible}
        animationType="slide"
        onRequestClose={() => setScannerVisible(false)}
      >
        <QRScanner
          context={scanMode}
          onResult={handleScanResult}
          onClose={() => setScannerVisible(false)}
          autoConfirm={scanMode === 'entrega'}
        />
      </Modal>

      {/* Novedad / No-entregable modal */}
      <Modal
        visible={novedadVisible}
        animationType="slide"
        transparent
        onRequestClose={closeNovedadModal}
      >
        <KeyboardAvoidingView
          style={styles.novedadOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.novedadSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.novedadTitle}>
              {novedadMode === 'no-entregable' ? 'Marcar como No Entregable' : 'Registrar novedad'}
            </Text>

            {/* Tipo de novedad — dropdown */}
            <Text style={styles.fieldLabel}>Tipo (opcional)</Text>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => setDropdownOpen(o => !o)}
              activeOpacity={0.8}
            >
              <Text style={novedadType ? styles.dropdownValueSelected : styles.dropdownValuePlaceholder}>
                {novedadType
                  ? (NOVEDAD_TYPES.find(t => t.value === novedadType)?.label ?? novedadType)
                  : 'Seleccionar tipo...'}
              </Text>
              <Text style={styles.dropdownCaret}>{dropdownOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {dropdownOpen && (
              <View style={styles.dropdownList}>
                {NOVEDAD_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.dropdownItem, novedadType === t.value && styles.dropdownItemActive]}
                    onPress={() => { setNovedadType(t.value); setDropdownOpen(false) }}
                  >
                    <Text style={[styles.dropdownItemText, novedadType === t.value && styles.dropdownItemTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Description field — required for novedad, optional for no-entregable */}
            {novedadMode === 'novedad' && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Descripción</Text>
                <TextInput
                  style={styles.novedadInput}
                  value={novedadText}
                  onChangeText={setNovedadText}
                  placeholder="Describe la novedad..."
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </>
            )}

            {/* Comentario libre — shown in both modes */}
            <Text style={[styles.fieldLabel, { marginTop: novedadMode === 'novedad' ? 0 : spacing.sm }]}>
              {novedadMode === 'no-entregable' ? 'Comentario (opcional)' : 'Comentario adicional (opcional)'}
            </Text>
            <TextInput
              style={styles.novedadInput}
              value={comentario}
              onChangeText={setComentario}
              placeholder="Agrega un comentario..."
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.novedadActions}>
              <TouchableOpacity
                style={styles.novedadCancel}
                onPress={closeNovedadModal}
              >
                <Text style={styles.novedadCancelText}>Cancelar</Text>
              </TouchableOpacity>
              {novedadMode === 'novedad' ? (
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
              ) : (
                <TouchableOpacity
                  style={[styles.noEntregableSubmit, novedadLoading && styles.novedadSubmitDisabled]}
                  onPress={marcarNoEntregable}
                  disabled={novedadLoading}
                >
                  {novedadLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.noEntregableSubmitText}>Confirmar</Text>
                  }
                </TouchableOpacity>
              )}
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
  progressCard: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
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
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  reqIcon: { width: 24, alignItems: 'center' },
  reqProduct: { color: theme.text, fontSize: 14, fontWeight: '500', marginBottom: 6 },
  reqProgressTrack: {
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  reqProgressFill: {
    height: 4,
    backgroundColor: theme.amber,
    borderRadius: 2,
  },
  reqProgressDone: { backgroundColor: '#22c55e' },
  reqCount: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    minWidth: 36,
    textAlign: 'right',
  },
  reqCountDone: { color: '#22c55e' },
  scanDeliverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: theme.amber,
    borderRadius: radius.sm,
  },
  scanDeliverBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  barrelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  barrelId: { color: theme.text, fontSize: 14, fontWeight: '500', flex: 1 },
  barrelProduct: { color: theme.textSecondary, fontSize: 12 },
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
    margin: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
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
  noEntregableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: '#dc2626',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#b91c1c',
  },
  noEntregableBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fieldLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    backgroundColor: theme.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: 4,
  },
  dropdownValuePlaceholder: { color: theme.textSecondary, fontSize: 14 },
  dropdownValueSelected: { color: theme.text, fontSize: 14, fontWeight: '500' },
  dropdownCaret: { color: theme.textSecondary, fontSize: 12 },
  dropdownList: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    backgroundColor: theme.bg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  dropdownItemActive: { backgroundColor: 'rgba(249,115,22,0.1)' },
  dropdownItemText: { color: theme.text, fontSize: 14 },
  dropdownItemTextActive: { color: theme.orange, fontWeight: '700' },
  noEntregableSubmit: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noEntregableSubmitText: { color: '#fff', fontWeight: 'bold' },
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
