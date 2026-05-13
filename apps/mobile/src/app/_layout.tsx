import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { getAccessToken, getStoredUser } from '@/lib/auth'
import { theme } from '@/lib/theme'
import type { User } from '@/lib/types'

export default function RootLayout() {
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    async function checkAuth() {
      const token = await getAccessToken()
      const inAuth = segments[0] === '(auth)'
      if (!token && !inAuth) {
        router.replace('/(auth)/login')
      } else if (token && inAuth) {
        const user = await getStoredUser<User>()
        if (user?.role === 'TRANSPORTISTA') {
          router.replace('/(transportista)')
        } else {
          router.replace('/(bodega)')
        }
      }
    }
    checkAuth()
  }, [segments, router])

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      />
    </>
  )
}
