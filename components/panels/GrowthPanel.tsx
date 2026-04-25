'use client';
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { GrowthMetrics, OverviewKPIs } from '@/lib/types';
import { formatNumber, formatFullNumber, formatTrend, trendColor } from '@/lib/utils';
import PinButton from '../PinButton';

const TOOLTIP_STYLE = { background: 'rgba(12,13,22,0.92)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, fontSize: 13, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' } as const;
const LABEL_STYLE = { color: '#8b8da3', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontSize: 11, fontWeight: 600 };

export default function GrowthPanel({ growth, kpis }: { growth: GrowthMetrics; kpis: OverviewKPIs }) {
  return (
    <div>
      <div className="panel-header">
        <h2>Growth & Momentum</h2>
        <p>Velocity, trajectory, and momentum indicators</p>
      </div>

      <div className="kpi-grid">
        <div className="stat-card animate-in">
          <PinButton metricKey="growth.wow" />
          <div className="stat-card-label">Week-over-Week</div>
          <div className="stat-card-value" data-trend={growth.wowGrowth > 0 ? 'up' : growth.wowGrowth < 0 ? 'down' : ''}>{formatTrend(growth.wowGrowth)}</div>
          <div className="stat-card-sub">{formatNumber(kpis.currentWeekStreams)} this week</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-1">
          <PinButton metricKey="growth.avg4w" />
          <div className="stat-card-label">4-Week Rolling Avg</div>
          <div className="stat-card-value">{formatNumber(growth.rollingAvg4W)}</div>
          <div className="stat-card-sub">per week</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-2">
          <div className="stat-card-label">12-Week Rolling Avg</div>
          <div className="stat-card-value">{formatNumber(growth.rollingAvg12W)}</div>
          <div className="stat-card-sub">per week</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-3">
          <div className="stat-card-label">12W vs Prior 12W</div>
          <div className="stat-card-value" data-trend={growth.trailing12WvsP12 > 0 ? 'up' : growth.trailing12WvsP12 < 0 ? 'down' : ''}>{formatTrend(growth.trailing12WvsP12)}</div>
          <div className="stat-card-sub">medium-term trajectory</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-4">
          <PinButton metricKey="growth.velocity" />
          <div className="stat-card-label">Stream Velocity</div>
          <div className="stat-card-value">{growth.streamVelocity}%</div>
          <div className="stat-card-sub">annualized recent % of ATD</div>
        </div>
        <div className="stat-card animate-in">
          <div className="stat-card-label">YTD Pace (Annualized)</div>
          <div className="stat-card-value">{formatNumber(growth.ytdPace)}</div>
          <div className="stat-card-sub">projected full-year total</div>
        </div>
      </div>

      <div className="chart-card animate-in">
        <PinButton metricKey="growth.weeklyChart" />
        <div className="chart-card-header"><h3>Weekly Streams with Moving Averages</h3></div>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={growth.weeklyTrend}>
            <defs>
              <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.floor(growth.weeklyTrend.length / 10)} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={55} />
            <Tooltip contentStyle={TOOLTIP_STYLE}
              formatter={(v: any, name: any) => [formatFullNumber(v), name === 'quantity' ? 'Streams' : name === 'ma4' ? '4W Avg' : '12W Avg']}
              labelStyle={LABEL_STYLE} />
            <Area type="monotone" dataKey="quantity" stroke="#6366f1" strokeWidth={1} fill="url(#growthGrad)" />
            <Line type="monotone" dataKey="ma4" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ma12" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="chart-inline-legend">
          <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-indigo" /> Raw Streams</span>
          <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-emerald" /> 4W Moving Avg</span>
          <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-amber" /> 12W Moving Avg</span>
        </div>
      </div>
    </div>
  );
}
