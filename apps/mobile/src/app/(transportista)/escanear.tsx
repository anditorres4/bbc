import { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { QRScanner } from '@/components/QRScanner'
import { theme, spacing } from '@/lib/theme'
import type { BarrelScanResult } from '@/lib/types'

export default function EscanearTransportista() {
  const [lastScan, setLastScan] = useState<string | null>(null)

  function handleResult(result: BarrelScanResult, action: string) {
    if (action !== 'cancel') {
      setLastScan(`${result.barrel.id} — ${result.barrel.status}`)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      {lastScan && (
        <View style={styles.lastScan}>
          <Text style={styles.lastScanText}>Último: {lastScan}</Text>
        </View>
      )}
      <QRScanner
        context="informativo"
        onResult={handleResult}
        onClose={() => setLastScan(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  lastScan: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 60,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  lastScanText: { color: theme.amber, fontSize: 12, fontWeight: '600' },
})
