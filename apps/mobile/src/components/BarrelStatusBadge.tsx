import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { BarrelStatus } from '@/lib/types'

const STATUS_CONFIG: Record<BarrelStatus, { label: string; bg: string }> = {
  EN_BODEGA: { label: 'En Bodega', bg: '#16a34a' },
  EN_ALISTAMIENTO: { label: 'Alistamiento', bg: '#f59e0b' },
  EN_TRANSPORTE: { label: 'En Transporte', bg: '#2563eb' },
  ENTREGADO: { label: 'Entregado', bg: '#7c3aed' },
  EN_RECOGIDA: { label: 'En Recogida', bg: '#0891b2' },
  DEVUELTO: { label: 'Devuelto', bg: '#0891b2' },
  EN_MANTENIMIENTO: { label: 'Mantenimiento', bg: '#d97706' },
  BAJA: { label: 'Baja', bg: '#dc2626' },
}

interface Props {
  status: BarrelStatus
}

export function BarrelStatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: '#78716c' }
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={styles.label}>{cfg.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  label: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
})
