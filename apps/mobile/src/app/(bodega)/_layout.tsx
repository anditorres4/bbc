import { useEffect, useRef } from 'react'
import { Tabs } from 'expo-router'
import { Home, ScanLine, Bell } from 'lucide-react-native'
import { theme } from '@/lib/theme'
import { useNetworkState } from '@/lib/network'
import { drainQueue, queueSize } from '@/lib/offline'

function NetworkDrainer() {
  const { isConnected, setStatus } = useNetworkState()
  const wasPreviouslyOffline = useRef(false)

  useEffect(() => {
    if (!isConnected) {
      wasPreviouslyOffline.current = true
      return
    }
    if (wasPreviouslyOffline.current && queueSize() > 0) {
      wasPreviouslyOffline.current = false
      setStatus('syncing')
      drainQueue().finally(() => setStatus('online'))
    } else {
      wasPreviouslyOffline.current = false
    }
  }, [isConnected, setStatus])

  return null
}

export default function BodegaLayout() {
  return (
    <>
      <NetworkDrainer />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: theme.amber,
          tabBarInactiveTintColor: theme.textSecondary,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color }) => <Home size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="escanear"
          options={{
            title: 'Escanear',
            tabBarIcon: ({ color }) => <ScanLine size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="alertas"
          options={{
            title: 'Alertas',
            tabBarIcon: ({ color }) => <Bell size={22} color={color} />,
          }}
        />
        <Tabs.Screen name="recepcion" options={{ href: null }} />
        <Tabs.Screen name="alistamiento" options={{ href: null }} />
      </Tabs>
    </>
  )
}
