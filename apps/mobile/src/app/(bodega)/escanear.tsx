import { useState } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { QRScanner } from '@/components/QRScanner'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
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

function BarrelCard({ scan }: { scan: BarrelScanResult }) {
  const { barrel } = scan
  const events: BarrelEvent[] = barrel.events?.slice(0, 3) ?? []
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
})

export default function EscanearScreen() {
  const router = useRouter()
  const [lastScan, setLastScan] = useState<BarrelScanResult | null>(null)

  function handleResult(result: BarrelScanResult, action: string) {
    if (action !== 'cancel') setLastScan(result)
  }

  return (
    <View style={styles.container}>
      <QRScanner
        context="informativo"
        onResult={handleResult}
        onClose={() => router.back()}
      />
      {lastScan && (
        <ScrollView style={styles.overlay} scrollEnabled>
          <BarrelCard scan={lastScan} />
        </ScrollView>
      )}
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
    maxHeight: '50%',
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
})
