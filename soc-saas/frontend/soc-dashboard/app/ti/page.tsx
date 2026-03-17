'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tiApi } from '@/lib/api'
import { SeverityBadge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import type { IOC } from '@/types'

const MITRE_TACTIC_COLORS: Record<string, string> = {
  'Initial Access': 'bg-red-500/20 border-red-500/30 text-red-400',
  'Execution': 'bg-orange-500/20 border-orange-500/30 text-orange-400',
  'Persistence': 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
  'Privilege Escalation': 'bg-purple-500/20 border-purple-500/30 text-purple-400',
  'Defense Evasion': 'bg-blue-500/20 border-blue-500/30 text-blue-400',
  'Credential Access': 'bg-pink-500/20 border-pink-500/30 text-pink-400',
  'Discovery': 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400',
  'Lateral Movement': 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400',
  'Collection': 'bg-green-500/20 border-green-500/30 text-green-400',
  'Command and Control': 'bg-red-500/20 border-red-500/30 text-red-400',
  'Exfiltration': 'bg-orange-500/20 border-orange-500/30 text-orange-400',
  'Impact': 'bg-red-700/20 border-red-700/30 text-red-300',
}

export default function TIPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<IOC[] | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<'feed' | 'mitre'>('feed')

  const { data: iocData, isLoading } = useQuery({
    queryKey: ['iocs', page],
    queryFn: () => tiApi.getIOCs({ page, page_size: 20 }),
    refetchInterval: 30000,
  })

  const { data: mitreData } = useQuery({
    queryKey: ['mitre'],
    queryFn: tiApi.getMitreTechniques,
  })

  const searchIOC = useMutation({
    mutationFn: (val: string) => tiApi.searchIOC(val),
    onSuccess: (data) => setSearchResults(data),
  })

  const handleSearch = () => {
    if (search.trim()) {
      searchIOC.mutate(search.trim())
    } else {
      setSearchResults(null)
    }
  }

  const displayIOCs = searchResults ?? (iocData?.iocs || [])
  const total = iocData?.total || 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Threat Intelligence</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">{total} indicators in database</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-sm bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded-lg hover:bg-[#00d4ff]/20"
        >
          + Add IOC
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by IP, domain, hash, URL..."
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            if (!e.target.value) setSearchResults(null)
          }}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#00d4ff] font-mono"
        />
        <button
          onClick={handleSearch}
          className="px-5 py-2 text-sm bg-[#00d4ff] text-[#0f1117] font-semibold rounded-lg hover:bg-[#00bfe6]"
        >
          Search
        </button>
        {searchResults && (
          <button
            onClick={() => { setSearchResults(null); setSearch('') }}
            className="px-3 py-2 text-sm bg-[#21262d] text-[#8b949e] rounded-lg hover:bg-[#30363d]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#21262d]">
        <button
          onClick={() => setActiveTab('feed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'feed'
              ? 'text-[#00d4ff] border-[#00d4ff]'
              : 'text-[#8b949e] border-transparent hover:text-white'
          }`}
        >
          IOC Feed {searchResults && `(${searchResults.length} results)`}
        </button>
        <button
          onClick={() => setActiveTab('mitre')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'mitre'
              ? 'text-[#00d4ff] border-[#00d4ff]'
              : 'text-[#8b949e] border-transparent hover:text-white'
          }`}
        >
          MITRE ATT&CK
        </button>
      </div>

      {activeTab === 'feed' && (
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#21262d] text-xs text-[#8b949e] uppercase tracking-wider">
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Value</th>
                <th className="text-left px-4 py-3">Severity</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">Score</th>
                <th className="text-left px-4 py-3">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !searchResults && (
                <tr><td colSpan={6} className="text-center py-12 text-[#8b949e]">Loading...</td></tr>
              )}
              {displayIOCs.length === 0 && !isLoading && (
                <tr><td colSpan={6} className="text-center py-12 text-[#8b949e]">No IOCs found</td></tr>
              )}
              {displayIOCs.map(ioc => (
                <tr key={ioc.id} className="border-b border-[#21262d] hover:bg-[#21262d]/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs bg-[#21262d] text-[#8b949e] px-2 py-0.5 rounded font-mono uppercase">
                      {ioc.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#00d4ff] font-mono max-w-xs truncate">{ioc.value}</td>
                  <td className="px-4 py-3"><SeverityBadge severity={ioc.severity} /></td>
                  <td className="px-4 py-3 text-xs text-[#8b949e]">{ioc.source}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${ioc.score}%`,
                            background: ioc.score >= 80 ? '#ef4444' : ioc.score >= 60 ? '#f97316' : ioc.score >= 40 ? '#eab308' : '#3b82f6',
                          }}
                        />
                      </div>
                      <span className="text-xs text-[#8b949e]">{Math.round(ioc.score)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8b949e]">{formatDate(ioc.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!searchResults && total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#21262d]">
              <span className="text-xs text-[#8b949e]">Page {page} · {total} total</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 text-xs bg-[#0f1117] border border-[#21262d] rounded text-white disabled:opacity-40">Prev</button>
                <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 text-xs bg-[#0f1117] border border-[#21262d] rounded text-white disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'mitre' && (
        <div>
          <div className="text-xs text-[#8b949e] mb-4">
            Top 20 MITRE ATT&CK techniques — click any to visit the official documentation
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(mitreData || []).map(t => {
              const colorClass = MITRE_TACTIC_COLORS[t.tactic] || 'bg-[#21262d] border-[#30363d] text-[#8b949e]'
              return (
                <a
                  key={t.id}
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block p-4 rounded-xl border ${colorClass} hover:opacity-80 transition-opacity cursor-pointer`}
                >
                  <div className="font-mono text-sm font-bold mb-1">{t.id}</div>
                  <div className="text-xs font-medium leading-snug mb-2">{t.name}</div>
                  <div className="text-xs opacity-70">{t.tactic}</div>
                  {t.count > 0 && (
                    <div className="mt-2 text-xs opacity-60">{t.count} hits</div>
                  )}
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Add IOC Modal */}
      {showAdd && <AddIOCModal onClose={() => setShowAdd(false)} onAdded={() => {
        setShowAdd(false)
        qc.invalidateQueries({ queryKey: ['iocs'] })
      }} />}
    </div>
  )
}

function AddIOCModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [type, setType] = useState('ip')
  const [value, setValue] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [source, setSource] = useState('manual')
  const [desc, setDesc] = useState('')

  const addIOC = useMutation({
    mutationFn: () => tiApi.addIOC({ type: type as IOC['type'], value, severity: severity as IOC['severity'], source, description: desc }),
    onSuccess: onAdded,
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">Add IOC</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">TYPE</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]">
              {['ip', 'domain', 'hash', 'url', 'email'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">VALUE *</label>
            <input value={value} onChange={e => setValue(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#00d4ff] font-mono"
              placeholder={type === 'ip' ? '192.168.1.1' : type === 'domain' ? 'example.com' : type === 'hash' ? 'sha256...' : 'value...'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">SEVERITY</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)}
                className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">SOURCE</label>
              <input value={source} onChange={e => setSource(e.target.value)}
                className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none"
                placeholder="manual" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">DESCRIPTION</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8b949e] focus:outline-none"
              placeholder="Threat description..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-sm bg-[#0f1117] border border-[#21262d] text-[#8b949e] rounded-lg">Cancel</button>
            <button onClick={() => addIOC.mutate()} disabled={!value.trim() || addIOC.isPending}
              className="flex-1 py-2 text-sm bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded-lg disabled:opacity-40">
              {addIOC.isPending ? 'Adding...' : 'Add IOC'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
