import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import {
  ClipboardList, PackageCheck, ScanLine, Bell,
} from 'lucide-react-native'
import { theme, spacing, radius } from '@/lib/theme'
import { useNetworkState } from '@/lib/network'
import { NetworkDot } from '@/components/NetworkDot'
import { getStoredUser } from '@/lib/auth'
import { getSessionCount } from '@/lib/offline'
import type { User } from '@/lib/types'

interface ActionCard {
  label: string
  icon: React.ReactNode
  route: string
  badge?: number
}

export default function HomeScreen() {
  const router = useRouter()
  const { status } = useNetworkState()
  const [user, setUser] = useState<Pick<User, 'name'> | null>(null)
  const [sessionCount, setSessionCount] = useState(0)

  useEffect(() => {
    getStoredUser<User>().then(u => setUser(u))
  }, [])

  useFocusEffect(
    useCallback(() => {
      setSessionCount(getSessionCount())
    }, [])
  )

  const cards: ActionCard[] = [
    {
      label: 'Alistar Ruta',
      icon: <ClipboardList size={32} color={theme.amber} />,
      route: '/(bodega)/alistamiento',
    },
    {
      label: 'Recibir Barriles',
      icon: <PackageCheck size={32} color={theme.amber} />,
      route: '/(bodega)/recepcion',
    },
    {
      label: 'Escanear',
      icon: <ScanLine size={32} color={theme.amber} />,
      route: '/(bodega)/escanear',
    },
    {
      label: 'Alertas',
      icon: <Bell size={32} color={theme.amber} />,
      route: '/(bodega)/alertas',
    },
  ]

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola,</Text>
            <Text style={styles.name}>{user?.name ?? '...'}</Text>
          </View>
          <NetworkDot status={status} />
        </View>

        <View style={styles.grid}>
          {cards.map(card => (
            <TouchableOpacity
              key={card.route}
              style={styles.card}
              onPress={() => router.push(card.route as never)}
              activeOpacity={0.75}
            >
              {card.icon}
              <Text style={styles.cardLabel}>{card.label}</Text>
              {card.badge !== undefined && card.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{card.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.statsLabel}>Barriles procesados hoy</Text>
          <Text style={styles.statsValue}>{sessionCount}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  greeting: { fontSize: 14, color: theme.textSecondary },
  name: { fontSize: 24, fontWeight: 'bold', color: theme.text },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  card: {
    width: '47%',
    minHeight: 100,
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cardLabel: {
    color: theme.text,
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: theme.red,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  statsCard: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statsLabel: { color: theme.textSecondary, fontSize: 13 },
  statsValue: { color: theme.amber, fontSize: 40, fontWeight: 'bold', marginTop: 4 },
})
