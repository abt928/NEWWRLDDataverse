'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { OverviewKPIs, GrowthMetrics, DistroKidDataset } from '@/lib/types';
import { formatNumber, formatFullNumber, formatTrend, trendColor, formatCurrency } from '@/lib/utils';

export default function OverviewPanel({ kpis, growth, timeline, distrokid }: { kpis: OverviewKPIs; growth: GrowthMetrics; timeline: { date: string; quantity: number }[]; distrokid?: DistroKidDataset }) {
  // Blended CPM from DK (AM + Spotify only)
  const CORE_PLATFORMS = ['Spotify', 'Apple Music'];
  const corePlatforms = distrokid?.platformBreakdown.filter((p) => CORE_PLATFORMS.includes(p.store)) ?? [];
  const coreEarnings = corePlatforms.reduce((s, p) => s + p.earnings, 0);
  const coreStreams = corePlatforms.reduce((s, p) => s + p.streams, 0);
  const blendedCpm = coreStreams > 0 ? Math.round((coreEarnings / coreStreams) * 1000 * 100) / 100 : null;
  const annualRevenue = blendedCpm ? Math.round((growth.ytdPace / 1000) * blendedCpm) : null;

  return (
    <div>
      <div className="panel-header">
        <h2>{kpis.artistName}</h2>
        <p>{kpis.genre} • {kpis.timeFrame} • {kpis.totalSongs} songs across {kpis.totalReleases} releases</p>
      </div>

      {/* Row 1: Core streaming KPIs */}
      <div className="kpi-grid">
        <div className="stat-card highlight animate-in">
          <div className="stat-card-label">All-Time Streams</div>
          <div className="stat-card-value">{formatNumber(kpis.totalATD)}</div>
          <div className="stat-card-sub">{formatFullNumber(kpis.totalATD)} total</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-1">
          <div className="stat-card-label">This Week</div>
          <div className="stat-card-value">{formatNumber(kpis.currentWeekStreams)}</div>
          <div className="stat-card-trend" style={{ color: trendColor(growth.wowGrowth) }}>{formatTrend(growth.wowGrowth)} WoW</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-2">
          <div className="stat-card-label">12W Average</div>
          <div className="stat-card-value">{formatNumber(kpis.trailingAvg12W)}</div>
          <div className="stat-card-sub">per week</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-3">
          <div className="stat-card-label">Top Song</div>
          <div className="stat-card-value stat-card-value-sm">{kpis.topSongTitle}</div>
          <div className="stat-card-sub">{formatNumber(kpis.topSongATD)} ATD</div>
        </div>

        {/* Row 2: Deal context — only when DistroKid data present */}
        {blendedCpm !== null && (
          <div className="stat-card highlight animate-in">
            <div className="stat-card-label">Blended CPM (AM + Spotify)</div>
            <div className="stat-card-value">${blendedCpm}</div>
            <div className="stat-card-sub">${(blendedCpm / 1000).toFixed(4)}/stream</div>
          </div>
        )}
        {annualRevenue !== null && (
          <div className="stat-card animate-in animate-in-delay-1">
            <div className="stat-card-label">Est. Annual Revenue</div>
            <div className="stat-card-value">{formatCurrency(annualRevenue)}</div>
            <div className="stat-card-sub">Based on current pace × CPM</div>
          </div>
        )}
        {distrokid && (
          <div className="stat-card animate-in animate-in-delay-2">
            <div className="stat-card-label">Total DistroKid Earnings</div>
            <div className="stat-card-value">${distrokid.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div className="stat-card-sub">{distrokid.monthlyRevenue.length} months of data</div>
          </div>
        )}
        <div className="stat-card animate-in animate-in-delay-3">
          <div className="stat-card-label">Peak Week</div>
          <div className="stat-card-value">{formatNumber(kpis.peakWeekStreams)}</div>
          <div className="stat-card-sub">{kpis.peakWeekDate}</div>
        </div>
      </div>

      {/* Streaming Timeline */}
      <div className="chart-card animate-in">
        <div className="chart-card-header"><h3>Streaming Timeline</h3></div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={timeline}>
            <defs>
              <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.floor(timeline.length / 8)} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={50} />
            <Tooltip contentStyle={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13 }} formatter={(v: any) => [formatFullNumber(v), 'Streams']} labelStyle={{ color: '#8b8da3' }} />
            <Area type="monotone" dataKey="quantity" stroke="#6366f1" strokeWidth={2} fill="url(#streamGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue Timeline — when DistroKid data present */}
      {distrokid && distrokid.monthlyRevenue.length > 0 && (
        <div className="chart-card animate-in">
          <div className="chart-card-header"><h3>Revenue Timeline (DistroKid)</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={distrokid.monthlyRevenue}>
              <defs>
                <linearGradient id="revenueGradOv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(distrokid.monthlyRevenue.length / 8))} />
              <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v}`} width={50} />
              <Tooltip contentStyle={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13 }} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Revenue']} labelStyle={{ color: '#8b8da3' }} />
              <Area type="monotone" dataKey="earnings" stroke="#34d399" strokeWidth={2} fill="url(#revenueGradOv)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
