import React from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import type { NetworkStatus } from '@/lib/network'
import { theme } from '@/lib/theme'

interface Props {
  status: NetworkStatus
}

export function NetworkDot({ status }: Props) {
  if (status === 'syncing') {
    return <ActivityIndicator size="small" color={theme.orange} />
  }
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: status === 'online' ? theme.green : theme.red },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
})
