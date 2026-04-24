'use client';
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { GrowthMetrics, OverviewKPIs } from '@/lib/types';
import { formatNumber, formatFullNumber, formatTrend, trendColor } from '@/lib/utils';

export default function GrowthPanel({ growth, kpis }: { growth: GrowthMetrics; kpis: OverviewKPIs }) {
  return (
    <div>
      <div className="panel-header">
        <h2>Growth & Momentum</h2>
        <p>Velocity, trajectory, and momentum indicators</p>
      </div>

      <div className="kpi-grid">
        <div className="stat-card">
          <div className="stat-card-label">Week-over-Week</div>
          <div className="stat-card-value" style={{ color: trendColor(growth.wowGrowth) }}>{formatTrend(growth.wowGrowth)}</div>
          <div className="stat-card-sub">{formatNumber(kpis.currentWeekStreams)} this week</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">4-Week Rolling Avg</div>
          <div className="stat-card-value">{formatNumber(growth.rollingAvg4W)}</div>
          <div className="stat-card-sub">per week</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">12-Week Rolling Avg</div>
          <div className="stat-card-value">{formatNumber(growth.rollingAvg12W)}</div>
          <div className="stat-card-sub">per week</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">12W vs Prior 12W</div>
          <div className="stat-card-value" style={{ color: trendColor(growth.trailing12WvsP12) }}>{formatTrend(growth.trailing12WvsP12)}</div>
          <div className="stat-card-sub">medium-term trajectory</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Stream Velocity</div>
          <div className="stat-card-value">{growth.streamVelocity}%</div>
          <div className="stat-card-sub">annualized recent % of ATD</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">YTD Pace (Annualized)</div>
          <div className="stat-card-value">{formatNumber(growth.ytdPace)}</div>
          <div className="stat-card-sub">projected full-year total</div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-header"><h3>Weekly Streams with Moving Averages</h3></div>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={growth.weeklyTrend}>
            <defs>
              <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.floor(growth.weeklyTrend.length / 10)} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={55} />
            <Tooltip contentStyle={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              formatter={(v: any, name: any) => [formatFullNumber(v), name === 'quantity' ? 'Streams' : name === 'ma4' ? '4W Avg' : '12W Avg']}
              labelStyle={{ color: '#8b8da3' }} />
            <Area type="monotone" dataKey="quantity" stroke="#6366f1" strokeWidth={1} fill="url(#growthGrad)" />
            <Line type="monotone" dataKey="ma4" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ma12" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span>🟣 Raw Streams</span><span>🟢 4W Moving Avg</span><span>🟡 12W Moving Avg</span>
        </div>
      </div>
    </div>
  );
}
