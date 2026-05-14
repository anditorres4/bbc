import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { theme, spacing } from '@/lib/theme'

export function NetworkStatusBar() {
  const { isConnected, isSyncing, pendingCount, errorCount, clearOfflineErrors } = useNetworkStatus()

  const hasErrors = errorCount > 0 && isConnected && !isSyncing

  if (isConnected && !isSyncing && pendingCount === 0 && errorCount === 0) return null

  let bgColor: string = theme.red
  let label = 'Sin conexión — guardando localmente'

  if (isSyncing) {
    bgColor = theme.orange
    label = `Sincronizando... ${pendingCount} evento${pendingCount !== 1 ? 's' : ''}`
  } else if (hasErrors) {
    bgColor = '#CA8A04'
    label = `${errorCount} evento${errorCount !== 1 ? 's' : ''} con error — toca para limpiar`
  }

  return (
    <TouchableOpacity
      style={[styles.bar, { backgroundColor: bgColor }]}
      onPress={hasErrors ? clearOfflineErrors : undefined}
      activeOpacity={hasErrors ? 0.7 : 1}
    >
      {isSyncing && <ActivityIndicator size="small" color="#fff" style={styles.spinner} />}
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  bar: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  spinner: { marginRight: 6 },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
})
