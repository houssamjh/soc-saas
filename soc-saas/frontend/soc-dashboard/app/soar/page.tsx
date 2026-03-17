'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { soarApi } from '@/lib/api'
import { formatDate, formatRelative } from '@/lib/utils'
import type { Playbook } from '@/types'

const ACTION_TYPES = [
  { value: 'create_case', label: 'Create Case', icon: '📋' },
  { value: 'notify_slack', label: 'Notify Slack', icon: '💬' },
  { value: 'block_ip', label: 'Block IP', icon: '🛡' },
  { value: 'send_email', label: 'Send Email', icon: '📧' },
]

export default function SOARPage() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Playbook | null>(null)

  const { data: playbooks, isLoading } = useQuery({
    queryKey: ['playbooks'],
    queryFn: soarApi.getPlaybooks,
    refetchInterval: 30000,
  })

  const { data: executions } = useQuery({
    queryKey: ['executions'],
    queryFn: () => soarApi.getExecutions(),
    refetchInterval: 15000,
  })

  const togglePlaybook = useMutation({
    mutationFn: (id: string) => soarApi.togglePlaybook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playbooks'] }),
  })

  const executePlaybook = useMutation({
    mutationFn: (id: string) => soarApi.executePlaybook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playbooks'] })
      qc.invalidateQueries({ queryKey: ['executions'] })
      alert('Playbook executed successfully!')
    },
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">SOAR — Playbook Manager</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            {playbooks?.filter(p => p.is_active).length || 0} active playbooks
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 text-sm bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded-lg hover:bg-[#00d4ff]/20"
        >
          + New Playbook
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Playbooks list */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider">Playbooks</h2>

          {isLoading && <div className="text-sm text-[#8b949e]">Loading...</div>}
          {!isLoading && (!playbooks || playbooks.length === 0) && (
            <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-8 text-center text-[#8b949e] text-sm">
              No playbooks yet. Create one to start automating responses.
            </div>
          )}

          {playbooks?.map(pb => (
            <div
              key={pb.id}
              className={`bg-[#161b22] border rounded-xl p-4 cursor-pointer transition-colors ${
                selected?.id === pb.id ? 'border-[#00d4ff]/40' : 'border-[#21262d] hover:border-[#30363d]'
              }`}
              onClick={() => setSelected(pb)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${pb.is_active ? 'bg-green-400' : 'bg-[#484f58]'}`} />
                    <span className="text-sm font-medium text-white truncate">{pb.name}</span>
                  </div>
                  {pb.description && (
                    <div className="text-xs text-[#8b949e] line-clamp-2 mb-2">{pb.description}</div>
                  )}
                  <div className="flex gap-3 text-xs text-[#8b949e]">
                    <span>
                      Trigger: <span className="text-orange-400">{pb.trigger.alert_severity}</span> severity
                    </span>
                    <span>{pb.actions.length} actions</span>
                    <span>{pb.execution_count} runs</span>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => executePlaybook.mutate(pb.id)}
                    disabled={!pb.is_active || executePlaybook.isPending}
                    className="px-2.5 py-1 text-xs bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded hover:bg-[#00d4ff]/20 disabled:opacity-40"
                  >
                    Run
                  </button>
                  <button
                    onClick={() => togglePlaybook.mutate(pb.id)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      pb.is_active
                        ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
                        : 'bg-[#21262d] text-[#8b949e] border-[#30363d] hover:bg-[#30363d]'
                    }`}
                  >
                    {pb.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>

              {/* Action steps */}
              <div className="mt-3 flex gap-1.5 flex-wrap">
                {pb.actions.map((action, i) => {
                  const actionType = ACTION_TYPES.find(a => a.value === action.type)
                  return (
                    <span key={i} className="text-xs bg-[#0f1117] border border-[#21262d] px-2 py-0.5 rounded text-[#8b949e]">
                      {actionType?.icon} {actionType?.label || action.type}
                    </span>
                  )
                })}
              </div>

              {pb.last_executed && (
                <div className="mt-2 text-xs text-[#8b949e]">
                  Last run: {formatRelative(pb.last_executed)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Execution history */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider">Execution History</h2>

          <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
            {!executions || executions.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#8b949e]">No executions yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#21262d] text-xs text-[#8b949e] uppercase">
                    <th className="text-left px-4 py-3">Playbook</th>
                    <th className="text-left px-4 py-3">Trigger</th>
                    <th className="text-left px-4 py-3">Actions</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.slice(0, 20).map(e => (
                    <tr key={e.id} className="border-b border-[#21262d] hover:bg-[#21262d]/30">
                      <td className="px-4 py-3 text-xs text-white truncate max-w-[150px]">{e.playbook_name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          e.trigger_source === 'auto'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-[#21262d] text-[#8b949e]'
                        }`}>
                          {e.trigger_source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8b949e]">
                        {e.actions_executed?.length || 0} steps
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          e.status === 'success'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8b949e]">{formatRelative(e.executed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showNew && <NewPlaybookModal onClose={() => setShowNew(false)} onCreated={() => {
        setShowNew(false)
        qc.invalidateQueries({ queryKey: ['playbooks'] })
      }} />}
    </div>
  )
}

function NewPlaybookModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [triggerSeverity, setTriggerSeverity] = useState('high')
  const [triggerType, setTriggerType] = useState('any')
  const [selectedActions, setSelectedActions] = useState<string[]>(['create_case'])

  const createPlaybook = useMutation({
    mutationFn: () => soarApi.createPlaybook({
      name,
      description: desc,
      trigger: { alert_severity: triggerSeverity, alert_type: triggerType },
      actions: selectedActions.map((type, i) => ({ step: i + 1, type, params: {} })),
      is_active: true,
    } as Partial<Playbook>),
    onSuccess: onCreated,
  })

  const toggleAction = (action: string) => {
    setSelectedActions(prev =>
      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">New Playbook</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">NAME *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#00d4ff]"
              placeholder="Playbook name..." />
          </div>
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">DESCRIPTION</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#00d4ff]"
              placeholder="What does this playbook do?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">TRIGGER SEVERITY</label>
              <select value={triggerSeverity} onChange={e => setTriggerSeverity(e.target.value)}
                className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {['any', 'low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">ALERT TYPE</label>
              <input value={triggerType} onChange={e => setTriggerType(e.target.value)}
                className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                placeholder="any, phishing, ransomware..." />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#8b949e] mb-2 block">ACTIONS</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_TYPES.map(action => (
                <label key={action.value}
                  className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedActions.includes(action.value)
                      ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff]'
                      : 'bg-[#0f1117] border-[#21262d] text-[#8b949e] hover:border-[#30363d]'
                  }`}>
                  <input type="checkbox" checked={selectedActions.includes(action.value)}
                    onChange={() => toggleAction(action.value)} className="sr-only" />
                  <span>{action.icon}</span>
                  <span className="text-xs">{action.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-sm bg-[#0f1117] border border-[#21262d] text-[#8b949e] rounded-lg">Cancel</button>
            <button onClick={() => createPlaybook.mutate()} disabled={!name.trim() || selectedActions.length === 0 || createPlaybook.isPending}
              className="flex-1 py-2 text-sm bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded-lg disabled:opacity-40">
              {createPlaybook.isPending ? 'Creating...' : 'Create Playbook'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
