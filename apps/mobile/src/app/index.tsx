import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>BBC Barrel Track</Text>
        <Text style={styles.subtitle}>Sistema de trazabilidad de barriles</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdf4e7' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#c4780b' },
  subtitle: { marginTop: 8, fontSize: 14, color: '#6b7280' },
})
