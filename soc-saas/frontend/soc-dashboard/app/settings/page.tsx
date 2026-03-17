'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { siemApi, caseApi, tiApi, soarApi } from '@/lib/api'
import axios from 'axios'

interface HealthResult {
  name: string
  url: string
  status: 'ok' | 'error' | 'loading'
  latency: number
  service?: string
}

async function checkHealth(name: string, url: string): Promise<HealthResult> {
  const start = Date.now()
  try {
    const resp = await axios.get(url, { timeout: 5000 })
    return { name, url, status: 'ok', latency: Date.now() - start, service: resp.data?.service }
  } catch {
    return { name, url, status: 'error', latency: Date.now() - start }
  }
}

const SERVICES = [
  { name: 'SIEM Service', healthUrl: 'http://localhost:8001/health', docsUrl: 'http://localhost:8001/docs' },
  { name: 'Case Service', healthUrl: 'http://localhost:8002/health', docsUrl: 'http://localhost:8002/docs' },
  { name: 'TI Service', healthUrl: 'http://localhost:8003/health', docsUrl: 'http://localhost:8003/docs' },
  { name: 'SOAR Service', healthUrl: 'http://localhost:8004/health', docsUrl: 'http://localhost:8004/docs' },
  { name: 'Elasticsearch', healthUrl: 'http://localhost:9200/_cluster/health', docsUrl: 'http://localhost:9200' },
  { name: 'Kibana', healthUrl: 'http://localhost:5601/api/status', docsUrl: 'http://localhost:5601' },
  { name: 'Kafka UI', healthUrl: 'http://localhost:8080/actuator/health', docsUrl: 'http://localhost:8080' },
  { name: 'Grafana', healthUrl: 'http://localhost:3000/api/health', docsUrl: 'http://localhost:3000' },
  { name: 'MinIO', healthUrl: 'http://localhost:9000/minio/health/live', docsUrl: 'http://localhost:9001' },
  { name: 'Keycloak', healthUrl: 'http://localhost:8443/health/ready', docsUrl: 'http://localhost:8443' },
  { name: 'Prometheus', healthUrl: 'http://localhost:9090/-/healthy', docsUrl: 'http://localhost:9090' },
]

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResult[]>([])
  const [checking, setChecking] = useState(false)

  const { data: siemStats } = useQuery({
    queryKey: ['siem-stats'],
    queryFn: siemApi.getStats,
  })

  const { data: rules } = useQuery({
    queryKey: ['rules'],
    queryFn: siemApi.getRules,
  })

  const checkAll = async () => {
    setChecking(true)
    const results = await Promise.all(
      SERVICES.map(s => checkHealth(s.name, s.healthUrl))
    )
    setHealth(results)
    setChecking(false)
  }

  useEffect(() => {
    checkAll()
  }, [])

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-white">Settings & System Health</h1>
        <p className="text-sm text-[#8b949e] mt-0.5">Monitor service health and platform configuration</p>
      </div>

      {/* Service Health */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21262d]">
          <h2 className="text-sm font-semibold text-white">Service Health</h2>
          <button
            onClick={checkAll}
            disabled={checking}
            className="px-3 py-1.5 text-xs bg-[#21262d] text-[#8b949e] rounded-lg hover:bg-[#30363d] disabled:opacity-40"
          >
            {checking ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        <div className="divide-y divide-[#21262d]">
          {SERVICES.map((svc, i) => {
            const result = health.find(h => h.name === svc.name)
            return (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    !result ? 'bg-[#484f58]' :
                    result.status === 'ok' ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  <span className="text-sm text-white">{svc.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  {result && (
                    <>
                      <span className={`text-xs ${result.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                        {result.status === 'ok' ? `${result.latency}ms` : 'unreachable'}
                      </span>
                    </>
                  )}
                  <a
                    href={svc.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#00d4ff] hover:underline"
                  >
                    Open →
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* SIEM Stats */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">SIEM Statistics</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Alerts Today', value: siemStats?.total_today ?? '—' },
            { label: 'Critical', value: siemStats?.critical ?? '—', color: 'text-red-400' },
            { label: 'Open', value: siemStats?.open ?? '—', color: 'text-yellow-400' },
            { label: 'Active Rules', value: rules?.total ?? '—', color: 'text-[#00d4ff]' },
          ].map((stat, i) => (
            <div key={i} className="bg-[#0f1117] rounded-lg p-3">
              <div className="text-xs text-[#8b949e] mb-1">{stat.label}</div>
              <div className={`text-2xl font-bold ${stat.color || 'text-white'}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Correlation Rules */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#21262d]">
          <h2 className="text-sm font-semibold text-white">Active Correlation Rules</h2>
        </div>
        {rules?.rules && rules.rules.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#21262d] text-xs text-[#8b949e] uppercase">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Severity</th>
                <th className="text-left px-4 py-3">MITRE</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.rules.map((rule: { id: string; name: string; severity: string; mitre_technique?: string; is_active: boolean }) => (
                <tr key={rule.id} className="border-b border-[#21262d] hover:bg-[#21262d]/30">
                  <td className="px-4 py-3 text-sm text-white">{rule.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      rule.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                      rule.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      rule.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>{rule.severity}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#00d4ff] font-mono">{rule.mitre_technique || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${rule.is_active ? 'bg-green-400' : 'bg-[#484f58]'}`} />
                      <span className="text-xs text-[#8b949e]">{rule.is_active ? 'active' : 'inactive'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-[#8b949e]">No rules loaded yet. Run seed-data.sh to create sample rules.</div>
        )}
      </div>

      {/* Quick links */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Kibana', url: 'http://localhost:5601', desc: 'Log exploration' },
            { label: 'Grafana', url: 'http://localhost:3000', desc: 'Metrics & dashboards' },
            { label: 'Kafka UI', url: 'http://localhost:8080', desc: 'Message broker' },
            { label: 'Keycloak', url: 'http://localhost:8443', desc: 'Auth management' },
            { label: 'MinIO', url: 'http://localhost:9001', desc: 'Object storage' },
            { label: 'Prometheus', url: 'http://localhost:9090', desc: 'Metrics collection' },
            { label: 'SIEM API', url: 'http://localhost:8001/docs', desc: 'API documentation' },
            { label: 'Elasticsearch', url: 'http://localhost:9200', desc: 'Search engine' },
          ].map(link => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-[#0f1117] border border-[#21262d] rounded-lg hover:border-[#00d4ff]/30 transition-colors group"
            >
              <div className="text-sm font-medium text-white group-hover:text-[#00d4ff] transition-colors">{link.label}</div>
              <div className="text-xs text-[#8b949e] mt-0.5">{link.desc}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Default credentials */}
      <div className="bg-[#161b22] border border-yellow-500/30 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-yellow-400">⚠</span>
          <h2 className="text-sm font-semibold text-yellow-400">Default Development Credentials</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          {[
            ['Grafana', 'admin / admin'],
            ['Keycloak', 'admin / admin123'],
            ['MinIO', 'minioadmin / minioadmin123'],
            ['PostgreSQL', 'soc_admin / socpassword123'],
          ].map(([svc, creds]) => (
            <div key={svc} className="bg-[#0f1117] rounded-lg p-3">
              <div className="text-[#8b949e] mb-1">{svc}</div>
              <div className="text-yellow-300">{creds}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#8b949e] mt-3">Change these before exposing to any network.</p>
      </div>
    </div>
  )
}
