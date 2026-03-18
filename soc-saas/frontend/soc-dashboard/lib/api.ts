import axios from 'axios'
import type {
  Alert, AlertListResponse, Rule,
  Case, CaseListResponse, TimelineEvent,
  IOC, IOCListResponse, MITRETechnique,
  Playbook, PlaybookExecution, DashboardStats,
} from '@/types'

const API_URL = '/api'

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ── SIEM ────────────────────────────────────────────────────────────────────

export const siemApi = {
  ingestEvent: (event: Partial<Alert>) =>
    api.post('/siem/events', event).then(r => r.data),

  getAlerts: (params?: {
    page?: number
    page_size?: number
    severity?: string
    status?: string
    event_type?: string
    search?: string
  }): Promise<AlertListResponse> =>
    api.get('/siem/alerts', { params }).then(r => r.data),

  getAlert: (id: string): Promise<Alert> =>
    api.get(`/siem/alerts/${id}`).then(r => r.data),

  updateAlertStatus: (id: string, status: string, note?: string) =>
    api.put(`/siem/alerts/${id}/status`, { status, note }).then(r => r.data),

  getStats: (): Promise<DashboardStats> =>
    api.get('/siem/stats').then(r => r.data),

  getRules: (): Promise<{ rules: Rule[]; total: number }> =>
    api.get('/siem/rules').then(r => r.data),

  createRule: (rule: Partial<Rule>) =>
    api.post('/siem/rules', rule).then(r => r.data),

  health: (): Promise<{ status: string; service: string }> =>
    api.get('/siem/../health').then(r => r.data),
}

// ── Cases ───────────────────────────────────────────────────────────────────

export const caseApi = {
  getCases: (params?: {
    page?: number
    page_size?: number
    status?: string
    severity?: string
    search?: string
  }): Promise<CaseListResponse> =>
    api.get('/cases', { params }).then(r => r.data),

  getCase: (id: string): Promise<Case> =>
    api.get(`/cases/${id}`).then(r => r.data),

  createCase: (data: Partial<Case>): Promise<Case> =>
    api.post('/cases', data).then(r => r.data),

  updateCase: (id: string, data: Partial<Case>): Promise<Case> =>
    api.put(`/cases/${id}`, data).then(r => r.data),

  deleteCase: (id: string) =>
    api.delete(`/cases/${id}`).then(r => r.data),

  addTimeline: (id: string, event: { event: string; author?: string; event_type?: string }): Promise<TimelineEvent> =>
    api.post(`/cases/${id}/timeline`, event).then(r => r.data),

  assignCase: (id: string, analyst: string): Promise<Case> =>
    api.post(`/cases/${id}/assign`, { analyst }).then(r => r.data),

  health: () =>
    api.get('/cases/../health').then(r => r.data),
}

// ── Threat Intelligence ──────────────────────────────────────────────────────

export const tiApi = {
  addIOC: (ioc: Partial<IOC>): Promise<IOC> =>
    api.post('/ti/ioc', ioc).then(r => r.data),

  searchIOC: (value: string): Promise<IOC[]> =>
    api.get('/ti/ioc/search', { params: { value } }).then(r => r.data),

  getIOCs: (params?: {
    page?: number
    page_size?: number
    type?: string
    severity?: string
  }): Promise<IOCListResponse> =>
    api.get('/ti/feed', { params }).then(r => r.data),

  importFeed: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/ti/feed/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  getMitreTechniques: (): Promise<MITRETechnique[]> =>
    api.get('/ti/mitre').then(r => r.data),

  health: () =>
    api.get('/ti/../health').then(r => r.data),
}

// ── SOAR ─────────────────────────────────────────────────────────────────────

export const soarApi = {
  getPlaybooks: (): Promise<Playbook[]> =>
    api.get('/soar/playbooks').then(r => r.data),

  getPlaybook: (id: string): Promise<Playbook> =>
    api.get(`/soar/playbooks/${id}`).then(r => r.data),

  createPlaybook: (data: Partial<Playbook>): Promise<Playbook> =>
    api.post('/soar/playbooks', data).then(r => r.data),

  executePlaybook: (id: string, context?: Record<string, unknown>) =>
    api.post(`/soar/playbooks/${id}/execute`, context || {}).then(r => r.data),

  togglePlaybook: (id: string) =>
    api.put(`/soar/playbooks/${id}/toggle`).then(r => r.data),

  getExecutions: (playbookId?: string): Promise<PlaybookExecution[]> => {
    const url = playbookId
      ? `/soar/playbooks/${playbookId}/executions`
      : '/soar/executions'
    return api.get(url).then(r => r.data)
  },

  health: () =>
    api.get('/soar/../health').then(r => r.data),
}

// ── Direct service health checks (bypassing nginx prefix) ───────────────────

export async function checkServiceHealth(serviceUrl: string): Promise<{ status: string; latency: number }> {
  const start = Date.now()
  try {
    const resp = await axios.get(`${serviceUrl}/health`, { timeout: 5000 })
    return { status: resp.data.status || 'ok', latency: Date.now() - start }
  } catch {
    return { status: 'error', latency: Date.now() - start }
  }
}

export default api
