import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { getAccessToken } from '@/lib/auth'
import { theme } from '@/lib/theme'

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
        router.replace('/(bodega)')
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
