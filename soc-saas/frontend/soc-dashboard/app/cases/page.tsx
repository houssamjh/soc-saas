'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { caseApi } from '@/lib/api'
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { formatRelative, formatDate } from '@/lib/utils'
import type { Case } from '@/types'

const COLUMNS: { status: string; label: string; color: string }[] = [
  { status: 'open', label: 'Open', color: 'border-red-500/40' },
  { status: 'in-progress', label: 'In Progress', color: 'border-yellow-500/40' },
  { status: 'resolved', label: 'Resolved', color: 'border-green-500/40' },
  { status: 'closed', label: 'Closed', color: 'border-[#21262d]' },
]

const ANALYSTS = ['alice.chen', 'bob.martinez', 'carol.johnson', 'dave.wilson', 'eve.nakamura']

export default function CasesPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Case | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newNote, setNewNote] = useState('')

  const { data } = useQuery({
    queryKey: ['cases-all'],
    queryFn: () => caseApi.getCases({ page_size: 100 }),
    refetchInterval: 15000,
  })

  const updateCase = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Case> }) => caseApi.updateCase(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['cases-all'] })
      setSelected(updated)
    },
  })

  const assignCase = useMutation({
    mutationFn: ({ id, analyst }: { id: string; analyst: string }) => caseApi.assignCase(id, analyst),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['cases-all'] })
      setSelected(updated)
    },
  })

  const addNote = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      caseApi.addTimeline(id, { event: note, author: 'analyst', event_type: 'note' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases-all'] })
      setNewNote('')
      if (selected) {
        caseApi.getCase(selected.id).then(setSelected)
      }
    },
  })

  const cases = data?.cases || []

  return (
    <div className="flex h-full">
      {/* Kanban */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Case Manager</h1>
            <p className="text-sm text-[#8b949e] mt-0.5">{data?.total || 0} total cases</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 text-sm bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded-lg hover:bg-[#00d4ff]/20"
          >
            + New Case
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 min-h-[600px]">
          {COLUMNS.map(col => {
            const colCases = cases.filter(c => c.status === col.status)
            return (
              <div key={col.status} className={`bg-[#161b22] rounded-xl border ${col.color} p-4`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">{col.label}</span>
                  <span className="text-xs text-[#8b949e] bg-[#21262d] rounded-full px-2 py-0.5">{colCases.length}</span>
                </div>
                <div className="space-y-3">
                  {colCases.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className="bg-[#0f1117] border border-[#21262d] rounded-lg p-3 cursor-pointer hover:border-[#00d4ff]/30 transition-colors"
                    >
                      <div className="text-xs text-white font-medium leading-snug mb-2 line-clamp-2">{c.title}</div>
                      <div className="flex items-center justify-between">
                        <SeverityBadge severity={c.severity} />
                        <span className="text-xs text-[#8b949e]">{formatRelative(c.created_at)}</span>
                      </div>
                      {c.assigned_to && (
                        <div className="mt-2 text-xs text-[#8b949e] truncate">
                          👤 {c.assigned_to}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Case detail panel */}
      {selected && (
        <div className="w-96 bg-[#161b22] border-l border-[#21262d] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#21262d]">
            <h2 className="text-sm font-semibold text-white">Case Detail</h2>
            <button onClick={() => setSelected(null)} className="text-[#8b949e] hover:text-white text-lg">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div>
              <div className="text-xs text-[#8b949e] mb-1">TITLE</div>
              <div className="text-sm text-white font-medium">{selected.title}</div>
            </div>

            {selected.description && (
              <div>
                <div className="text-xs text-[#8b949e] mb-1">DESCRIPTION</div>
                <div className="text-xs text-[#8b949e] leading-relaxed">{selected.description}</div>
              </div>
            )}

            <div className="flex gap-4">
              <div>
                <div className="text-xs text-[#8b949e] mb-1">SEVERITY</div>
                <SeverityBadge severity={selected.severity} />
              </div>
              <div>
                <div className="text-xs text-[#8b949e] mb-1">STATUS</div>
                <StatusBadge status={selected.status} />
              </div>
            </div>

            {/* Status update */}
            <div>
              <div className="text-xs text-[#8b949e] mb-2">UPDATE STATUS</div>
              <div className="flex gap-1 flex-wrap">
                {['open', 'in-progress', 'resolved', 'closed'].map(s => (
                  <button
                    key={s}
                    onClick={() => updateCase.mutate({ id: selected.id, data: { status: s as Case['status'] } })}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      selected.status === s
                        ? 'bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/40'
                        : 'bg-[#0f1117] text-[#8b949e] border-[#21262d] hover:border-[#484f58]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Assign */}
            <div>
              <div className="text-xs text-[#8b949e] mb-2">ASSIGNED TO</div>
              <select
                value={selected.assigned_to || ''}
                onChange={e => assignCase.mutate({ id: selected.id, analyst: e.target.value })}
                className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]"
              >
                <option value="">Unassigned</option>
                {ANALYSTS.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Timeline */}
            <div>
              <div className="text-xs text-[#8b949e] mb-2">TIMELINE</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(selected.timeline || []).map(e => (
                  <div key={e.id} className="flex gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] mt-1.5 shrink-0" />
                    <div>
                      <div className="text-xs text-white">{e.event}</div>
                      <div className="text-xs text-[#8b949e] mt-0.5">
                        {e.author} · {formatDate(e.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
                {(!selected.timeline || selected.timeline.length === 0) && (
                  <div className="text-xs text-[#8b949e]">No timeline events yet</div>
                )}
              </div>
            </div>

            {/* Add note */}
            <div>
              <div className="text-xs text-[#8b949e] mb-2">ADD NOTE</div>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Type a note..."
                className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#00d4ff] resize-none h-20"
              />
              <button
                onClick={() => newNote.trim() && addNote.mutate({ id: selected.id, note: newNote.trim() })}
                disabled={!newNote.trim() || addNote.isPending}
                className="mt-2 w-full py-1.5 text-xs bg-[#21262d] text-white rounded-lg hover:bg-[#30363d] disabled:opacity-40"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Case Modal */}
      {showNew && <NewCaseModal onClose={() => setShowNew(false)} onCreated={() => {
        setShowNew(false)
        qc.invalidateQueries({ queryKey: ['cases-all'] })
      }} />}
    </div>
  )
}

function NewCaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [severity, setSeverity] = useState('medium')

  const createCase = useMutation({
    mutationFn: () => caseApi.createCase({ title, description: desc, severity: severity as Case['severity'], status: 'open' }),
    onSuccess: onCreated,
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">New Case</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">TITLE *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#00d4ff]"
              placeholder="Case title..."
            />
          </div>
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">DESCRIPTION</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#00d4ff] resize-none h-24"
              placeholder="Describe the incident..."
            />
          </div>
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">SEVERITY</label>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-sm bg-[#0f1117] border border-[#21262d] text-[#8b949e] rounded-lg hover:bg-[#21262d]">
              Cancel
            </button>
            <button
              onClick={() => createCase.mutate()}
              disabled={!title.trim() || createCase.isPending}
              className="flex-1 py-2 text-sm bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded-lg hover:bg-[#00d4ff]/20 disabled:opacity-40"
            >
              {createCase.isPending ? 'Creating...' : 'Create Case'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
