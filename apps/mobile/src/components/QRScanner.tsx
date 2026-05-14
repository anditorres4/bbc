import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, Platform, ActivityIndicator,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { X, RefreshCw } from 'lucide-react-native'
import { api, OfflineError } from '@/lib/api'
import { BarrelStatusBadge } from './BarrelStatusBadge'
import { theme, spacing, radius } from '@/lib/theme'
import type { BarrelScanResult } from '@/lib/types'

const SCAN_WINDOW = 260
const SHEET_HEIGHT = 320
const COOLDOWN_MS = 2000
const BBC_QR_RE = /^BBC-\d{3,5}$/

export type ScannerContext =
  | 'alistamiento'
  | 'recepcion'
  | 'nuevo'
  | 'informativo'
  | 'entrega'
  | 'recogida_vacio'

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
  const [showManual, setShowManual] = useState(false)
  const [facing, setFacing] = useState<'front' | 'back'>('back')

  const lastScanRef = useRef<number>(0)
  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current
  const scanLineAnim = useRef(new Animated.Value(0)).current

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
    if (!BBC_QR_RE.test(data)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      setError('QR no reconocido — solo se aceptan barriles BBC')
      return
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    processQrCode(data)
  }

  function handleWebSearch() {
    const trimmed = webInput.trim()
    if (!trimmed) return
    if (!BBC_QR_RE.test(trimmed)) {
      setError('QR no reconocido — solo se aceptan barriles BBC')
      return
    }
    processQrCode(trimmed)
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
      : context === 'entrega'
      ? [
          { label: 'Confirmar entrega', action: 'entregar', primary: true },
          { label: 'Cancelar', action: 'cancel' },
        ]
      : context === 'recogida_vacio'
      ? [
          { label: 'Confirmar recogida', action: 'recoger', primary: true },
          { label: 'Cancelar', action: 'cancel' },
        ]
      : [{ label: 'Cerrar', action: 'cancel' }]

  return (
    <View style={styles.container}>
      {showManual ? (
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
            autoFocus
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
          <TouchableOpacity style={styles.switchModeBtn} onPress={() => { setShowManual(false); setError(null) }}>
            <Text style={styles.switchModeText}>← Usar cámara</Text>
          </TouchableOpacity>
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
            facing={facing}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={loading ? undefined : handleBarCodeScanned}
          />

          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.maskTop} />
            <View style={styles.middleRow}>
              <View style={styles.maskSide} />
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

          <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
            <RefreshCw size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.manualBtn} onPress={() => { setShowManual(true); setError(null) }}>
            <Text style={styles.manualBtnText}>Ingresar manualmente</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <X size={22} color={theme.text} />
      </TouchableOpacity>

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
  switchModeBtn: { marginTop: spacing.lg, alignItems: 'center' },
  switchModeText: { color: theme.textSecondary, fontSize: 14 },
  flipBtn: {
    position: 'absolute',
    top: 52,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtn: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
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
