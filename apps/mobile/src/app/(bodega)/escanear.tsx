import { useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, Platform, KeyboardAvoidingView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Wrench, RotateCcw } from 'lucide-react-native'
import { QRScanner } from '@/components/QRScanner'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
import { api } from '@/lib/api'
import { theme, spacing, radius } from '@/lib/theme'
import type { BarrelScanResult, BarrelEvent } from '@/lib/types'

const EVENT_LABELS: Record<string, string> = {
  REGISTRO: 'Registro',
  ALISTAMIENTO: 'Alistamiento',
  SALIDA_BODEGA: 'Salida bodega',
  LLEGADA_PUNTO: 'Llegada punto',
  ENTREGA_LLENO: 'Entregado',
  RECOGIDA_VACIO: 'Recogida vacío',
  RETORNO_BODEGA: 'Retorno bodega',
  ENVIO_MANTENIMIENTO: 'Enviado mantenimiento',
  RETORNO_MANTENIMIENTO: 'Retorno mantenimiento',
  DISPOSICION_FINAL: 'Baja',
  NOVEDAD: 'Novedad',
}

function formatTs(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function BarrelCard({ scan, onAction }: { scan: BarrelScanResult; onAction: (action: 'mantenimiento' | 'retorno') => void }) {
  const { barrel } = scan
  const events: BarrelEvent[] = barrel.events?.slice(0, 3) ?? []
  const canSendMaint = barrel.status === 'EN_BODEGA'
  const canReturnMaint = barrel.status === 'EN_MANTENIMIENTO'

  return (
    <View style={card.wrap}>
      <View style={card.header}>
        <Text style={card.id}>{barrel.id}</Text>
        <BarrelStatusBadge status={barrel.status} />
      </View>
      {barrel.product ? (
        <Text style={card.product}>{barrel.product}</Text>
      ) : null}
      {scan.created && (
        <View style={card.newBadge}>
          <Text style={card.newText}>Barril registrado</Text>
        </View>
      )}
      {events.length > 0 && (
        <View style={card.events}>
          <Text style={card.eventsTitle}>Últimos movimientos</Text>
          {events.map((ev, i) => (
            <View key={ev.id} style={[card.eventRow, i === events.length - 1 && card.eventRowLast]}>
              <View style={card.eventDot} />
              <View style={{ flex: 1 }}>
                <Text style={card.eventType}>{EVENT_LABELS[ev.type] ?? ev.type}</Text>
                {ev.notes ? <Text style={card.eventNotes} numberOfLines={1}>{ev.notes}</Text> : null}
              </View>
              <Text style={card.eventTs}>{formatTs(ev.timestamp)}</Text>
            </View>
          ))}
        </View>
      )}
      {events.length === 0 && !scan.created && (
        <Text style={card.noEvents}>Sin movimientos recientes</Text>
      )}

      {/* Maintenance actions */}
      {(canSendMaint || canReturnMaint) && (
        <View style={card.actions}>
          {canSendMaint && (
            <TouchableOpacity style={card.maintBtn} onPress={() => onAction('mantenimiento')}>
              <Wrench size={14} color={theme.orange} />
              <Text style={card.maintBtnText}>Enviar a mantenimiento</Text>
            </TouchableOpacity>
          )}
          {canReturnMaint && (
            <TouchableOpacity style={[card.maintBtn, card.returnBtn]} onPress={() => onAction('retorno')}>
              <RotateCcw size={14} color={theme.green} />
              <Text style={[card.maintBtnText, { color: theme.green }]}>Retorno a bodega</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  )
}

const card = StyleSheet.create({
  wrap: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  id: { fontSize: 18, fontWeight: 'bold', color: theme.text },
  product: { color: theme.textSecondary, fontSize: 13, paddingHorizontal: spacing.md, paddingVertical: 6 },
  newBadge: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: theme.green + '22',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  newText: { color: theme.green, fontSize: 12, fontWeight: '600' },
  events: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  eventsTitle: { color: theme.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 8, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginBottom: 10,
  },
  eventRowLast: { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.amber, marginTop: 5 },
  eventType: { color: theme.text, fontSize: 13, fontWeight: '500' },
  eventNotes: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
  eventTs: { color: theme.textSecondary, fontSize: 11 },
  noEvents: { color: theme.textSecondary, fontSize: 13, padding: spacing.md, textAlign: 'center' },
  actions: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  maintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.orange,
    backgroundColor: 'rgba(249,115,22,0.08)',
  },
  returnBtn: {
    borderColor: theme.green,
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  maintBtnText: { color: theme.orange, fontWeight: '600', fontSize: 14 },
})

export default function EscanearScreen() {
  const router = useRouter()
  const [lastScan, setLastScan] = useState<BarrelScanResult | null>(null)
  const [pendingAction, setPendingAction] = useState<'mantenimiento' | 'retorno' | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  function handleResult(result: BarrelScanResult, action: string) {
    if (action !== 'cancel') {
      setLastScan(result)
      setActionSuccess(null)
      setActionError(null)
    }
  }

  async function confirmAction() {
    if (!lastScan || !pendingAction || loading) return
    setLoading(true)
    setActionError(null)
    const endpoint = pendingAction === 'mantenimiento'
      ? `/api/barriles/${lastScan.barrel.id}/mantenimiento`
      : `/api/barriles/${lastScan.barrel.id}/retorno-mantenimiento`
    try {
      await api.post(endpoint, { notes: notes.trim() || undefined })
      const msg = pendingAction === 'mantenimiento'
        ? `${lastScan.barrel.id} enviado a mantenimiento`
        : `${lastScan.barrel.id} recibido en bodega`
      setActionSuccess(msg)
      setPendingAction(null)
      setNotes('')
      setLastScan(null)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e?.message ?? 'Error al procesar la acción')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <QRScanner
        context="informativo"
        onResult={handleResult}
        onClose={() => router.back()}
      />
      {actionSuccess && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{actionSuccess}</Text>
        </View>
      )}
      {lastScan && (
        <ScrollView style={styles.overlay} scrollEnabled>
          <BarrelCard
            scan={lastScan}
            onAction={action => { setPendingAction(action); setNotes(''); setActionError(null) }}
          />
        </ScrollView>
      )}

      {/* Confirm maintenance action modal */}
      <Modal
        visible={!!pendingAction}
        animationType="slide"
        transparent
        onRequestClose={() => setPendingAction(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>
              {pendingAction === 'mantenimiento' ? 'Enviar a mantenimiento' : 'Recibir de mantenimiento'}
            </Text>
            {lastScan && (
              <Text style={styles.modalBarrelId}>{lastScan.barrel.id}</Text>
            )}
            <TextInput
              style={styles.modalInput}
              value={notes}
              onChangeText={setNotes}
              placeholder={pendingAction === 'mantenimiento' ? 'Motivo (opcional)...' : 'Notas del taller (opcional)...'}
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            {actionError && (
              <Text style={styles.errorText}>{actionError}</Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setPendingAction(null); setActionError(null) }}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
                onPress={confirmAction}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={styles.confirmText}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '60%',
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  successBanner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: theme.green,
    borderRadius: radius.sm,
    padding: spacing.md,
    alignItems: 'center',
    zIndex: 200,
  },
  successText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: spacing.xs },
  modalBarrelId: { color: theme.amber, fontSize: 14, fontWeight: '600', marginBottom: spacing.md },
  modalInput: {
    height: 80,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: theme.text,
    backgroundColor: theme.bg,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  errorText: { color: theme.red, fontSize: 12, marginBottom: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: theme.text, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: theme.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: { color: '#000', fontWeight: 'bold' },
})
