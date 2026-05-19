import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Package, RotateCcw } from 'lucide-react-native'
import { api, OfflineError } from '@/lib/api'
import { enqueue, incrementSessionCount } from '@/lib/offline'
import { QRScanner } from '@/components/QRScanner'
import { BarrelStatusBadge } from '@/components/BarrelStatusBadge'
import { theme, spacing, radius } from '@/lib/theme'
import type { BarrelScanResult, Barrel } from '@/lib/types'

export default function RecepcionScreen() {
  const router = useRouter()
  const [received, setReceived] = useState<Barrel[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>()

  function showSuccess(msg: string) {
    clearTimeout(successTimerRef.current)
    setSuccessMsg(msg)
    successTimerRef.current = setTimeout(() => setSuccessMsg(null), 2500)
  }

  async function handleDeshacer(barrel: Barrel) {
    setErrorMsg(null)
    try {
      await api.post(`/api/barriles/${barrel.id}/revertir-ultimo`, {})
      setReceived(prev => prev.filter(b => b.id !== barrel.id))
      showSuccess(`Barril ${barrel.id} revertido`)
    } catch (err) {
      const e = err as { message?: string }
      setErrorMsg(e?.message ?? 'Error al revertir barril')
    }
  }

  async function handleResult(result: BarrelScanResult, action: string) {
    if (action === 'cancel') return
    const barrel = result.barrel
    setErrorMsg(null)
    try {
      await api.post(`/api/barriles/${barrel.id}/recibir`, {})
      setReceived(prev => [barrel, ...prev.filter(b => b.id !== barrel.id)])
      incrementSessionCount()
    } catch (err) {
      if (err instanceof OfflineError) {
        enqueue(`/api/barriles/${barrel.id}/recibir`, 'POST', {})
        setReceived(prev => [barrel, ...prev.filter(b => b.id !== barrel.id)])
        incrementSessionCount()
      } else {
        const e = err as { message?: string }
        setErrorMsg(e?.message ?? 'Error al recibir barril')
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Recepción de Barriles</Text>
      </View>

      <View style={styles.scannerContainer}>
        <QRScanner context="recepcion" onResult={handleResult} onClose={() => router.back()} />
      </View>

      {successMsg && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{successMsg}</Text>
        </View>
      )}

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <View style={styles.listSection}>
        <Text style={styles.listTitle}>
          Recibidos en esta sesión ({received.length})
        </Text>
        <FlatList
          data={received}
          keyExtractor={b => b.id}
          ListEmptyComponent={
            <View style={styles.emptyRow}>
              <Package size={24} color={theme.border} />
              <Text style={styles.emptyText}>Escanea un barril para recibirlo</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.barrelCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.barrelId}>{item.id}</Text>
                {item.product && (
                  <Text style={styles.barrelProduct}>{item.product}</Text>
                )}
              </View>
              <BarrelStatusBadge status={item.status} />
              <TouchableOpacity
                onPress={() => handleDeshacer(item)}
                style={styles.undoBtn}
                accessibilityLabel="Deshacer"
              >
                <RotateCcw size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
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
  scannerContainer: { height: 320 },
  successBanner: {
    backgroundColor: 'rgba(34,197,94,0.9)',
    padding: spacing.sm,
    margin: spacing.md,
    borderRadius: radius.sm,
  },
  successText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.9)',
    padding: spacing.sm,
    margin: spacing.md,
    borderRadius: radius.sm,
  },
  errorText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  listSection: { flex: 1, padding: spacing.md },
  listTitle: {
    color: theme.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  emptyRow: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyText: { color: theme.textSecondary, fontSize: 14 },
  barrelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: spacing.sm,
  },
  barrelId: { color: theme.text, fontWeight: '600', fontSize: 15 },
  barrelProduct: { color: theme.textSecondary, fontSize: 13, marginTop: 2 },
  undoBtn: { padding: 6, marginLeft: spacing.sm },
})
