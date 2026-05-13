import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Beer } from 'lucide-react-native'
import { api } from '@/lib/api'
import { setTokens, storeUser, clearTokens } from '@/lib/auth'
import { theme, spacing, radius } from '@/lib/theme'
import type { AuthResponse, Role } from '@/lib/types'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Ingresa email y contraseña')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await api.post<AuthResponse>('/auth/login', { email, password })
      await setTokens(res.accessToken, res.refreshToken)
      await storeUser(res.user)
      const role: Role = res.user.role
      if (role === 'OPERARIO_BODEGA') {
        router.replace('/(bodega)')
      } else if (role === 'TRANSPORTISTA') {
        router.replace('/(transportista)')
      } else {
        setError('Este rol solo puede acceder desde la versión web')
        await clearTokens()
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message ?? 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.center}>
          <View style={styles.logoContainer}>
            <Beer size={36} color="#fff" />
          </View>
          <Text style={styles.title}>BBC Barrel Track</Text>
          <Text style={styles.subtitle}>Operario · Transportista</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholderTextColor={theme.textSecondary}
            placeholder="usuario@bbc.co"
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholderTextColor={theme.textSecondary}
            placeholder="••••••••"
            onSubmitEditing={handleLogin}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.buttonText}>Iniciar sesión</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  center: { alignItems: 'center', marginBottom: spacing.xl },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: theme.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.amber },
  subtitle: { fontSize: 14, color: theme.textSecondary, marginTop: 4 },
  form: {
    backgroundColor: theme.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  label: { fontSize: 13, fontWeight: '500', color: theme.textSecondary, marginBottom: 6 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: theme.text,
    backgroundColor: theme.bg,
    fontSize: 15,
  },
  error: { color: theme.red, fontSize: 13, marginTop: spacing.sm },
  button: {
    height: 56,
    backgroundColor: theme.amber,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
})
