import { severityBg, statusColor } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'severity' | 'status' | 'default'
  value?: string
  className?: string
}

export function Badge({ children, variant = 'default', value, className = '' }: BadgeProps) {
  let classes = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium '

  if (variant === 'severity' && value) {
    classes += severityBg(value)
  } else if (variant === 'status' && value) {
    classes += statusColor(value)
  } else {
    classes += 'bg-[#21262d] text-[#8b949e]'
  }

  return (
    <span className={`${classes} ${className}`}>
      {children}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="severity" value={severity}>
      {severity.toUpperCase()}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="status" value={status}>
      {status}
    </Badge>
  )
}
