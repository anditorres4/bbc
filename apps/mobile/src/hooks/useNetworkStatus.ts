import { useState, useEffect, useRef, useCallback } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { processQueue, size as queueSize, getErrors, clearErrors } from '@/lib/offlineQueue'

export interface NetworkStatusResult {
  isConnected: boolean
  isInternetReachable: boolean
  isSyncing: boolean
  pendingCount: number
  errorCount: number
  clearOfflineErrors: () => void
}

export function useNetworkStatus(): NetworkStatusResult {
  const [isConnected, setIsConnected] = useState(true)
  const [isInternetReachable, setIsInternetReachable] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(() => queueSize())
  const [errorCount, setErrorCount] = useState(() => getErrors().length)
  const wasOffline = useRef(false)

  const sync = useCallback(async () => {
    if (queueSize() === 0) return
    setIsSyncing(true)
    try {
      await processQueue((remaining) => setPendingCount(remaining))
    } finally {
      setPendingCount(queueSize())
      setErrorCount(getErrors().length)
      setIsSyncing(false)
    }
  }, [])

  const clearOfflineErrors = useCallback(() => {
    clearErrors()
    setErrorCount(0)
  }, [])

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? false
      const reachable = state.isInternetReachable ?? false
      setIsConnected(connected)
      setIsInternetReachable(reachable)

      if (connected && wasOffline.current) {
        wasOffline.current = false
        void sync()
      } else if (!connected) {
        wasOffline.current = true
        setPendingCount(queueSize())
      }
    })
    return unsub
  }, [sync])

  return { isConnected, isInternetReachable, isSyncing, pendingCount, errorCount, clearOfflineErrors }
}
