import { Stack } from 'expo-router'
import { theme } from '@/lib/theme'

export default function AlistamientoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    />
  )
}
