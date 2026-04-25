'use client';
import { useMemo } from 'react';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart } from 'recharts';
import type { OverviewKPIs, GrowthMetrics, DistroKidDataset } from '@/lib/types';
import { formatNumber, formatFullNumber, formatTrend, trendColor, formatCurrency } from '@/lib/utils';
import PinButton from '../PinButton';

function formatCompact(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export default function OverviewPanel({ kpis, growth, timeline, distrokid }: { kpis: OverviewKPIs; growth: GrowthMetrics; timeline: { date: string; quantity: number }[]; distrokid?: DistroKidDataset }) {
  // Blended CPM from DK (AM + Spotify only)
  const CORE_PLATFORMS = ['Spotify', 'Apple Music'];
  const corePlatforms = distrokid?.platformBreakdown.filter((p) => CORE_PLATFORMS.includes(p.store)) ?? [];
  const coreEarnings = corePlatforms.reduce((s, p) => s + p.earnings, 0);
  const coreStreams = corePlatforms.reduce((s, p) => s + p.streams, 0);
  const blendedCpm = coreStreams > 0 ? Math.round((coreEarnings / coreStreams) * 1000 * 100) / 100 : null;
  const annualRevenue = blendedCpm ? Math.round((growth.ytdPace / 1000) * blendedCpm) : null;

  // Merge streaming timeline with revenue data for dual-axis chart
  const mergedTimeline = useMemo(() => {
    if (!distrokid || !distrokid.monthlyRevenue.length) return null;

    // Aggregate weekly streams into monthly
    const monthlyStreams = new Map<string, number>();
    for (const point of timeline) {
      // date is like "May 23" or "2025/05/23" — extract month
      // The timeline date format comes from getStartDate which returns "Mon DD" format
      // We need to match it against DK monthly format "YYYY-MM"
      // Let's just use the raw weekly data approach instead
    }

    // Build monthly streams from the artistWeekly dateRange pattern
    // Since we only have the timeline array with date strings, 
    // aggregate by matching month patterns
    const monthMap = new Map<string, { streams: number; earnings: number; month: string }>();

    // Add DK revenue data
    for (const mr of distrokid.monthlyRevenue) {
      monthMap.set(mr.month, {
        streams: 0,
        earnings: mr.earnings,
        month: mr.month,
      });
    }

    // Map timeline points to months (timeline dates are like "May 23, 2025" or short format)
    // We need to match these to YYYY-MM for DK data alignment
    // Since the timeline comes from getStartDate which parses "2025/05/23 - 2025/05/29",
    // let's work with the quantity data directly grouped by month
    // Actually the date format from computeArtistTimeline is from getStartDate()
    // Let me just create a merged monthly view

    // Create month labels for DK data
    const merged = distrokid.monthlyRevenue.map((mr: any) => {
      const [year, mo] = mr.month.split('-');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return {
        label: `${months[parseInt(mo) - 1]} '${year.slice(2)}`,
        month: mr.month,
        earnings: mr.earnings,
        streams: mr.coreStreams ?? mr.streams,
      };
    });

    return merged;
  }, [distrokid, timeline]);

  const hasDistrokid = !!distrokid && distrokid.monthlyRevenue.length > 0;

  const MergedTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="cpm-chart-tooltip">
        <div className="cpm-chart-tooltip-label">{label}</div>
        {d?.streams != null && (
          <div className="cpm-chart-tooltip-row">
            <span className="cpm-chart-tooltip-dot" data-type="streams" />
            <span>Streams: {d.streams.toLocaleString()}</span>
          </div>
        )}
        {d?.earnings != null && (
          <div className="cpm-chart-tooltip-row">
            <span className="cpm-chart-tooltip-dot" data-type="actual" />
            <span>Revenue: ${d.earnings.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="panel-header">
        <h2>{kpis.artistName}</h2>
        <p>{kpis.genre} • {kpis.timeFrame} • {kpis.totalSongs} songs across {kpis.totalReleases} releases</p>
      </div>

      {/* Row 1: Core streaming KPIs */}
      <div className="kpi-grid">
        <div className="stat-card highlight animate-in">
          <PinButton metricKey="overview.allTimeStreams" />
          <div className="stat-card-label">All-Time Streams</div>
          <div className="stat-card-value">{formatNumber(kpis.totalATD)}</div>
          <div className="stat-card-sub">{formatFullNumber(kpis.totalATD)} total</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-1">
          <PinButton metricKey="overview.thisWeek" />
          <div className="stat-card-label">This Week</div>
          <div className="stat-card-value">{formatNumber(kpis.currentWeekStreams)}</div>
          <div className="stat-card-trend" data-trend={growth.wowGrowth > 0 ? 'up' : growth.wowGrowth < 0 ? 'down' : ''}>{formatTrend(growth.wowGrowth)} WoW</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-2">
          <PinButton metricKey="overview.avg12w" />
          <div className="stat-card-label">12W Average</div>
          <div className="stat-card-value">{formatNumber(kpis.trailingAvg12W)}</div>
          <div className="stat-card-sub">per week</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-3">
          <PinButton metricKey="overview.topSong" />
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

      {/* Merged Streaming + Revenue Timeline when both sources present */}
      {hasDistrokid && mergedTimeline && mergedTimeline.length > 0 ? (
        <div className="chart-card animate-in">
          <div className="chart-card-header">
            <h3>Streams & Revenue</h3>
            <span className="chart-legend">
              <span className="chart-legend-item"><span className="chart-legend-color" data-color="streams" /> Streams (AM + Spotify)</span>
              <span className="chart-legend-item"><span className="chart-legend-color" data-color="actual" /> Revenue</span>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={mergedTimeline}>
              <defs>
                <linearGradient id="ovStreamGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ovRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(mergedTimeline.length / 8))} />
              <YAxis yAxisId="streams" orientation="right" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={50} />
              <YAxis yAxisId="revenue" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatCompact(v)} width={55} />
              <Tooltip content={<MergedTooltip />} />
              <Area yAxisId="streams" type="monotone" dataKey="streams" stroke="#6366f1" strokeWidth={2} fill="url(#ovStreamGrad)" />
              <Area yAxisId="revenue" type="monotone" dataKey="earnings" stroke="#34d399" strokeWidth={2} fill="url(#ovRevGrad)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        /* Streaming-only Timeline when no DK data */
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
              <Tooltip contentStyle={{ background: 'rgba(12,13,22,0.92)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, fontSize: 13, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }} formatter={(v: any) => [formatFullNumber(v), 'Streams']} labelStyle={{ color: '#8b8da3', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, fontWeight: 600 }} />
              <Area type="monotone" dataKey="quantity" stroke="#6366f1" strokeWidth={2} fill="url(#streamGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
