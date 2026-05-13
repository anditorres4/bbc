import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { QRScanner } from '@/components/QRScanner'
import { theme } from '@/lib/theme'
import type { BarrelScanResult } from '@/lib/types'

export default function EscanearScreen() {
  const router = useRouter()

  function handleResult(_result: BarrelScanResult, action: string) {
    if (action === 'cancel') return
  }

  return (
    <View style={styles.container}>
      <QRScanner
        context="informativo"
        onResult={handleResult}
        onClose={() => router.back()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
})
