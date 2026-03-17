'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { siemApi, caseApi } from '@/lib/api'
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { formatRelative, formatDate } from '@/lib/utils'
import type { Alert } from '@/types'

const SEVERITIES = ['', 'critical', 'high', 'medium', 'low']
const STATUSES = ['', 'open', 'investigating', 'closed']

export default function AlertsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Alert | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', page, severity, status, search],
    queryFn: () => siemApi.getAlerts({ page, page_size: 20, severity: severity || undefined, status: status || undefined, search: search || undefined }),
    refetchInterval: 15000,
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, st }: { id: string; st: string }) => siemApi.updateAlertStatus(id, st),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const createCase = useMutation({
    mutationFn: (alert: Alert) => caseApi.createCase({
      title: `[Alert] ${alert.title}`,
      description: `Created from alert ${alert.id}\nSource: ${alert.source_ip}\nRaw log: ${alert.raw_log}`,
      severity: alert.severity,
      status: 'open',
      alert_ids: [alert.id],
    }),
    onSuccess: () => {
      alert('Case created successfully!')
    },
  })

  const total = data?.total || 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="flex h-full">
      {/* Main */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Alert Console</h1>
            <p className="text-sm text-[#8b949e] mt-0.5">{total} alerts</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <input
            type="text"
            placeholder="Search alerts..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#00d4ff] w-64"
          />
          <select
            value={severity}
            onChange={e => { setSeverity(e.target.value); setPage(1) }}
            className="bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]"
          >
            {SEVERITIES.map(s => (
              <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Severities'}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Statuses'}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#21262d] text-xs text-[#8b949e] uppercase tracking-wider">
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3">Severity</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">MITRE</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#8b949e]">Loading...</td>
                </tr>
              )}
              {!isLoading && data?.alerts?.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#8b949e]">No alerts found</td>
                </tr>
              )}
              {data?.alerts?.map(alert => (
                <tr
                  key={alert.id}
                  className="border-b border-[#21262d] hover:bg-[#21262d]/50 cursor-pointer transition-colors"
                  onClick={() => setSelected(alert)}
                >
                  <td className="px-4 py-3 text-xs text-[#8b949e] font-mono whitespace-nowrap">
                    {formatRelative(alert.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-white max-w-xs">
                    <span className="truncate block">{alert.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={alert.severity} />
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8b949e] font-mono">{alert.source_ip}</td>
                  <td className="px-4 py-3 text-xs text-[#00d4ff] font-mono">{alert.mitre_technique || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={alert.status} />
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {alert.status === 'open' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: alert.id, st: 'investigating' })}
                          className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
                        >
                          Investigate
                        </button>
                      )}
                      {alert.status !== 'closed' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: alert.id, st: 'closed' })}
                          className="text-xs px-2 py-1 bg-[#21262d] text-[#8b949e] rounded hover:bg-[#30363d] transition-colors"
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-xs text-[#8b949e]">
              Page {page} of {totalPages} · {total} total
            </div>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs bg-[#161b22] border border-[#21262d] rounded text-white disabled:opacity-40 hover:bg-[#21262d]"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs bg-[#161b22] border border-[#21262d] rounded text-white disabled:opacity-40 hover:bg-[#21262d]"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="w-96 bg-[#161b22] border-l border-[#21262d] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#21262d]">
            <h2 className="text-sm font-semibold text-white">Alert Detail</h2>
            <button onClick={() => setSelected(null)} className="text-[#8b949e] hover:text-white text-lg">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <div className="text-xs text-[#8b949e] mb-1">TITLE</div>
              <div className="text-sm text-white font-medium">{selected.title}</div>
            </div>

            <div className="flex gap-3">
              <div>
                <div className="text-xs text-[#8b949e] mb-1">SEVERITY</div>
                <SeverityBadge severity={selected.severity} />
              </div>
              <div>
                <div className="text-xs text-[#8b949e] mb-1">STATUS</div>
                <StatusBadge status={selected.status} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-[#8b949e] mb-1">SOURCE IP</div>
                <div className="text-xs text-[#00d4ff] font-mono">{selected.source_ip}</div>
              </div>
              <div>
                <div className="text-xs text-[#8b949e] mb-1">EVENT TYPE</div>
                <div className="text-xs text-white font-mono">{selected.event_type}</div>
              </div>
              <div>
                <div className="text-xs text-[#8b949e] mb-1">HOST</div>
                <div className="text-xs text-white font-mono">{selected.host || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-[#8b949e] mb-1">USER</div>
                <div className="text-xs text-white font-mono">{selected.user || '—'}</div>
              </div>
            </div>

            {selected.mitre_technique && (
              <div>
                <div className="text-xs text-[#8b949e] mb-1">MITRE ATT&CK</div>
                <div className="text-xs text-[#00d4ff] font-mono">{selected.mitre_technique}</div>
              </div>
            )}

            {selected.rule_name && (
              <div>
                <div className="text-xs text-[#8b949e] mb-1">MATCHED RULE</div>
                <div className="text-xs text-purple-400">{selected.rule_name}</div>
              </div>
            )}

            {selected.raw_log && (
              <div>
                <div className="text-xs text-[#8b949e] mb-1">RAW LOG</div>
                <pre className="text-xs text-[#8b949e] bg-[#0f1117] rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                  {selected.raw_log}
                </pre>
              </div>
            )}

            <div>
              <div className="text-xs text-[#8b949e] mb-1">DETECTED</div>
              <div className="text-xs text-white">{formatDate(selected.created_at)}</div>
            </div>
          </div>

          <div className="p-4 border-t border-[#21262d] space-y-2">
            <button
              onClick={() => createCase.mutate(selected)}
              disabled={createCase.isPending}
              className="w-full py-2 text-sm bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded-lg hover:bg-[#00d4ff]/20 transition-colors disabled:opacity-50"
            >
              {createCase.isPending ? 'Creating...' : '+ Create Case'}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => updateStatus.mutate({ id: selected.id, st: 'investigating' })}
                className="flex-1 py-2 text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg hover:bg-yellow-500/20"
              >
                Investigate
              </button>
              <button
                onClick={() => updateStatus.mutate({ id: selected.id, st: 'closed' })}
                className="flex-1 py-2 text-xs bg-[#21262d] text-[#8b949e] border border-[#30363d] rounded-lg hover:bg-[#30363d]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
