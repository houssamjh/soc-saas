import { type ClassValue, clsx } from 'clsx'
import type { Severity } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function severityColor(severity: Severity | string): string {
  switch (severity) {
    case 'critical': return 'text-red-400'
    case 'high': return 'text-orange-400'
    case 'medium': return 'text-yellow-400'
    case 'low': return 'text-blue-400'
    default: return 'text-gray-400'
  }
}

export function severityBg(severity: Severity | string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-400 border border-red-500/30'
    case 'high': return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
    case 'medium': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
    case 'low': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    default: return 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'open': return 'bg-red-500/20 text-red-400 border border-red-500/30'
    case 'in-progress':
    case 'investigating': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
    case 'resolved':
    case 'closed': return 'bg-green-500/20 text-green-400 border border-green-500/30'
    default: return 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
  }
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + '…' : str
}
