export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type AlertStatus = 'open' | 'investigating' | 'closed'
export type CaseStatus = 'open' | 'in-progress' | 'resolved' | 'closed'

export interface Alert {
  id: string
  title: string
  severity: Severity
  status: AlertStatus
  source_ip: string
  event_type: string
  raw_log: string
  rule_id?: string
  rule_name?: string
  mitre_technique: string
  host: string
  user: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface AlertListResponse {
  alerts: Alert[]
  total: number
  page: number
  page_size: number
}

export interface Rule {
  id: string
  name: string
  description: string
  condition: {
    field: string
    operator: string
    value: string
  }
  threshold: number
  time_window: number
  severity: Severity
  mitre_technique: string
  tags: string[]
  is_active: boolean
  created_at: string
}

export interface TimelineEvent {
  id: string
  case_id: string
  event: string
  author: string
  event_type: string
  created_at: string
}

export interface Case {
  id: string
  title: string
  description: string
  severity: Severity
  status: CaseStatus
  assigned_to: string | null
  alert_ids: string[]
  tags: string[]
  created_at: string
  updated_at: string
  timeline: TimelineEvent[]
}

export interface CaseListResponse {
  cases: Case[]
  total: number
  page: number
  page_size: number
}

export interface IOC {
  id: string
  type: 'ip' | 'domain' | 'hash' | 'url' | 'email'
  value: string
  severity: Severity
  source: string
  description: string
  tags: string[]
  score: number
  is_active: boolean
  first_seen: string
  last_seen: string
  created_at: string
}

export interface IOCListResponse {
  iocs: IOC[]
  total: number
  page: number
  page_size: number
}

export interface MITRETechnique {
  id: string
  name: string
  tactic: string
  description: string
  url: string
  count: number
}

export interface PlaybookAction {
  step: number
  type: string
  params: Record<string, unknown>
}

export interface PlaybookTrigger {
  alert_severity: string
  alert_type: string
}

export interface Playbook {
  id: string
  name: string
  description: string
  trigger: PlaybookTrigger
  actions: PlaybookAction[]
  is_active: boolean
  execution_count: number
  last_executed: string | null
  created_at: string
  updated_at: string
}

export interface PlaybookExecution {
  id: string
  playbook_id: string
  playbook_name: string
  trigger_source: string
  alert_id: string | null
  status: string
  actions_executed: Array<{ step: number; type: string; status: string; message: string }>
  result: Record<string, unknown> | null
  executed_at: string
}

export interface ServiceHealth {
  service: string
  status: 'ok' | 'error' | 'unknown'
  latency?: number
}

export interface DashboardStats {
  total_today: number
  critical: number
  high: number
  medium: number
  low: number
  open: number
  investigating: number
  closed: number
  hourly_distribution: Array<{ time: string; count: number }>
  top_mitre_techniques: Array<{ technique: string; count: number }>
}
