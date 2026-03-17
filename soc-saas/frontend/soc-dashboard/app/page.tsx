'use client'

import { useQuery } from '@tanstack/react-query'
import { siemApi, caseApi, soarApi } from '@/lib/api'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { formatRelative } from '@/lib/utils'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
}

function KPICard({
  label, value, sub, accent
}: {
  label: string; value: string | number; sub?: string; accent?: string
}) {
  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
      <div className="text-xs text-[#8b949e] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-3xl font-bold ${accent || 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-[#8b949e] mt-1">{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { isConnected, recentAlerts } = useWebSocket()

  const { data: stats } = useQuery({
    queryKey: ['siem-stats'],
    queryFn: siemApi.getStats,
    refetchInterval: 30000,
  })

  const { data: casesData } = useQuery({
    queryKey: ['cases-summary'],
    queryFn: () => caseApi.getCases({ page_size: 1 }),
    refetchInterval: 30000,
  })

  const { data: playbooks } = useQuery({
    queryKey: ['playbooks'],
    queryFn: soarApi.getPlaybooks,
    refetchInterval: 60000,
  })

  const totalExecutions = playbooks?.reduce((s, p) => s + (p.execution_count || 0), 0) || 0

  const severityPieData = stats
    ? [
        { name: 'Critical', value: stats.critical || 0, color: '#ef4444' },
        { name: 'High', value: stats.high || 0, color: '#f97316' },
        { name: 'Medium', value: stats.medium || 0, color: '#eab308' },
        { name: 'Low', value: stats.low || 0, color: '#3b82f6' },
      ].filter(d => d.value > 0)
    : []

  const hourlyData = stats?.hourly_distribution?.map(h => ({
    time: new Date(h.time).getHours() + ':00',
    count: h.count,
  })) || []

  const mitreData = stats?.top_mitre_techniques?.slice(0, 8) || []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Security Operations Dashboard</h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Real-time threat monitoring and incident overview</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Alerts Today"
          value={stats?.total_today ?? '—'}
          sub={`${stats?.open ?? 0} open`}
          accent="text-[#00d4ff]"
        />
        <KPICard
          label="Critical Alerts"
          value={stats?.critical ?? '—'}
          sub="Requires immediate action"
          accent="text-red-400"
        />
        <KPICard
          label="Open Cases"
          value={casesData?.total ?? '—'}
          sub="Active incidents"
          accent="text-orange-400"
        />
        <KPICard
          label="Playbooks Executed"
          value={totalExecutions}
          sub={`${playbooks?.length ?? 0} configured`}
          accent="text-purple-400"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Severity donut */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Severity Distribution</h3>
          {severityPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={severityPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  dataKey="value"
                  stroke="none"
                >
                  {severityPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8 }}
                  labelStyle={{ color: '#e6edf3' }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: '#8b949e', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-[#8b949e] text-sm">
              No alerts yet
            </div>
          )}
        </div>

        {/* Hourly area chart */}
        <div className="lg:col-span-2 bg-[#161b22] border border-[#21262d] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Alerts — Last 24 Hours</h3>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="alertGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#30363d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                <YAxis stroke="#30363d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8 }}
                  labelStyle={{ color: '#e6edf3' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  fill="url(#alertGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-[#8b949e] text-sm">
              No hourly data yet
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: MITRE chart + live feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* MITRE bar chart */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top MITRE ATT&CK Techniques</h3>
          {mitreData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mitreData} layout="vertical">
                <XAxis type="number" stroke="#30363d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="technique"
                  width={60}
                  stroke="#30363d"
                  tick={{ fill: '#8b949e', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8 }}
                  labelStyle={{ color: '#e6edf3' }}
                />
                <Bar dataKey="count" fill="#00d4ff" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-[#8b949e] text-sm">
              No MITRE data yet
            </div>
          )}
        </div>

        {/* Live alert feed */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Live Alert Feed</h3>
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              WebSocket
            </div>
          </div>

          {recentAlerts.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-[#8b949e] text-sm">
              <div className="text-center">
                <div className="text-2xl mb-2">📡</div>
                <div>Waiting for alerts...</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {recentAlerts.map((alert, i) => (
                <div
                  key={alert.id}
                  className={`
                    flex items-start gap-3 p-2.5 rounded-lg bg-[#0f1117] border border-[#21262d]
                    ${i === 0 ? 'animate-fade-in' : ''}
                  `}
                >
                  <SeverityBadge severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{alert.title}</div>
                    <div className="text-xs text-[#8b949e] mt-0.5 font-mono">{alert.source_ip}</div>
                  </div>
                  <div className="text-xs text-[#8b949e] shrink-0">{formatRelative(alert.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
