'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useWebSocket } from '@/contexts/WebSocketContext'

const navItems = [
  { href: '/', label: 'Dashboard', icon: '▦' },
  { href: '/alerts', label: 'Alerts', icon: '⚡' },
  { href: '/cases', label: 'Cases', icon: '📋' },
  { href: '/ti', label: 'Threat Intel', icon: '🎯' },
  { href: '/soar', label: 'SOAR', icon: '⚙' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { isConnected } = useWebSocket()

  return (
    <div className="w-60 bg-[#161b22] border-r border-[#21262d] flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#21262d]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#00d4ff]/20 rounded-lg flex items-center justify-center">
            <span className="text-[#00d4ff] text-sm font-bold">SOC</span>
          </div>
          <div>
            <div className="font-semibold text-white text-sm">SOC Platform</div>
            <div className="text-xs text-[#8b949e]">Security Operations</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2">
        <div className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-2 mb-3">
          Navigation
        </div>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                    ${isActive
                      ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                      : 'text-[#8b949e] hover:bg-[#21262d] hover:text-white'
                    }
                  `}
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  {item.label}
                  {item.href === '/alerts' && isActive && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-[#00d4ff] animate-pulse" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* WebSocket status */}
      <div className="px-4 py-4 border-t border-[#21262d]">
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
            {isConnected ? 'Live alerts' : 'Reconnecting...'}
          </span>
        </div>
      </div>
    </div>
  )
}
