import { useState, useEffect } from 'react'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

export type NetworkStatus = 'online' | 'offline' | 'syncing'

export function useNetworkState() {
  const [isConnected, setIsConnected] = useState<boolean>(true)
  const [status, setStatus] = useState<NetworkStatus>('online')

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false
      setIsConnected(connected)
      setStatus(connected ? 'online' : 'offline')
    })
    return unsubscribe
  }, [])

  return { isConnected, status, setStatus }
}
