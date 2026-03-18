'use client'

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { Alert } from '@/types'

interface WSContextValue {
  isConnected: boolean
  recentAlerts: Alert[]
  clearAlerts: () => void
}

const WSContext = createContext<WSContextValue>({
  isConnected: false,
  recentAlerts: [],
  clearAlerts: () => {},
})

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${proto}://${window.location.host}/ws`
    const url = `${wsUrl}/alerts`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        // Send ping every 30s to keep alive
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, 30000)
        ;(ws as WebSocket & { _pingInterval?: ReturnType<typeof setInterval> })._pingInterval = ping
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data === 'pong') return

          // Handle both wrapped and unwrapped alert messages
          const alert: Alert = data.type === 'new_alert' ? data.data : data.type === 'recent_alerts' ? null : data
          if (!alert || !alert.id) return

          setRecentAlerts(prev => {
            const exists = prev.find(a => a.id === alert.id)
            if (exists) return prev
            return [alert, ...prev].slice(0, 50)
          })
        } catch {
          // Ignore parse errors (pong messages etc)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        const ws_ = wsRef.current as WebSocket & { _pingInterval?: ReturnType<typeof setInterval> } | null
        if (ws_?._pingInterval) clearInterval(ws_._pingInterval)
        // Reconnect after 5s
        reconnectTimer.current = setTimeout(connect, 5000)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      setIsConnected(false)
      reconnectTimer.current = setTimeout(connect, 5000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const clearAlerts = useCallback(() => setRecentAlerts([]), [])

  return (
    <WSContext.Provider value={{ isConnected, recentAlerts, clearAlerts }}>
      {children}
    </WSContext.Provider>
  )
}

export const useWebSocket = () => useContext(WSContext)
