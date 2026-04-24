'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import type { LuminateDataset } from '@/lib/types';
import { computeOverviewKPIs, computeGrowthMetrics, computeDealInsights, computeArtistTimeline, defaultFilters } from '@/lib/analytics';
import { formatNumber, formatCurrency, formatPct, getChartColor } from '@/lib/utils';

interface ArtistAnalysis {
  id: string;
  data: LuminateDataset;
  kpis: ReturnType<typeof computeOverviewKPIs>;
  growth: ReturnType<typeof computeGrowthMetrics>;
  deal: ReturnType<typeof computeDealInsights>;
  timeline: ReturnType<typeof computeArtistTimeline>;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const ids = searchParams.get('ids')?.split(',') ?? [];
  const [artists, setArtists] = useState<ArtistAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const results: ArtistAnalysis[] = [];
      for (const id of ids) {
        try {
          const res = await fetch(`/api/artists/${id}`);
          if (!res.ok) continue;
          const data: LuminateDataset = await res.json();
          results.push({
            id,
            data,
            kpis: computeOverviewKPIs(data),
            growth: computeGrowthMetrics(data),
            deal: computeDealInsights(data, defaultFilters),
            timeline: computeArtistTimeline(data),
          });
        } catch { /* skip */ }
      }
      setArtists(results);
      setLoading(false);
    }
    if (ids.length > 0) load();
    else setLoading(false);
  }, []);

  if (loading) return (
    <div className="home-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="home-loading"><div className="spinner" /><p>Loading comparison…</p></div>
    </div>
  );

  if (artists.length < 2) return (
    <div className="home-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <h2>Need at least 2 artists to compare</h2>
        <a href="/" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem' }}>← Back</a>
      </div>
    </div>
  );

  // Build merged timeline
  const allDates = new Set<string>();
  artists.forEach((a) => a.timeline.forEach((t) => allDates.add(t.date)));
  const sortedDates = Array.from(allDates).sort();
  const timelineData = sortedDates.map((date) => {
    const point: Record<string, string | number> = { date };
    artists.forEach((a) => {
      const match = a.timeline.find((t) => t.date === date);
      point[a.kpis.artistName] = match?.quantity ?? 0;
    });
    return point;
  });

  // Bar chart data for ATD comparison
  const atdData = artists.map((a, i) => ({ name: a.kpis.artistName, value: a.kpis.totalATD, color: getChartColor(i) }));

  return (
    <div className="home-page" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Artist Comparison</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{artists.map((a) => a.kpis.artistName).join(' vs ')}</p>
        </div>
        <a href="/" className="btn-secondary">← Back</a>
      </div>

      {/* KPI Comparison Table */}
      <div className="chart-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Key Metrics</h3>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                {artists.map((a, i) => <th key={a.id} style={{ color: getChartColor(i) }}>{a.kpis.artistName}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><td>All-Time Streams</td>{artists.map((a) => <td key={a.id} className="mono text-right">{formatNumber(a.kpis.totalATD)}</td>)}</tr>
              <tr><td>YTD Streams</td>{artists.map((a) => <td key={a.id} className="mono text-right">{formatNumber(a.kpis.ytdStreams)}</td>)}</tr>
              <tr><td>This Week</td>{artists.map((a) => <td key={a.id} className="mono text-right">{formatNumber(a.kpis.currentWeekStreams)}</td>)}</tr>
              <tr><td>12W Average</td>{artists.map((a) => <td key={a.id} className="mono text-right">{formatNumber(a.kpis.trailingAvg12W)}</td>)}</tr>
              <tr><td>WoW Growth</td>{artists.map((a) => <td key={a.id} className={`mono text-right ${a.growth.wowGrowth > 0 ? 'trend-up' : 'trend-down'}`}>{a.growth.wowGrowth > 0 ? '+' : ''}{a.growth.wowGrowth}%</td>)}</tr>
              <tr><td>Stream Velocity</td>{artists.map((a) => <td key={a.id} className="mono text-right">{a.growth.streamVelocity}%</td>)}</tr>
              <tr><td>Total Songs</td>{artists.map((a) => <td key={a.id} className="mono text-right">{a.kpis.totalSongs}</td>)}</tr>
              <tr><td>Top Song</td>{artists.map((a) => <td key={a.id} className="text-right">{a.kpis.topSongTitle}</td>)}</tr>
              <tr><td>Growth Status</td>{artists.map((a) => <td key={a.id} className="text-right"><span className={`classification-badge ${a.deal.growthClassification.toLowerCase()}`}>{a.deal.growthClassification}</span></td>)}</tr>
              <tr><td>Concentration (HHI)</td>{artists.map((a) => <td key={a.id} className="mono text-right">{a.deal.catalogConcentrationIndex.toLocaleString()}</td>)}</tr>
              <tr><td>Est. Annual Revenue</td>{artists.map((a) => <td key={a.id} className="mono text-right">{formatCurrency(a.deal.revenueEstimateLow)}–{formatCurrency(a.deal.revenueEstimateHigh)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeline Overlay */}
      <div className="chart-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Streaming Timeline Overlay</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={timelineData}>
            <XAxis dataKey="date" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.floor(sortedDates.length / 8)} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={55} />
            <Tooltip contentStyle={{ background: '#111113', border: '1px solid #1c1c1f', borderRadius: 8 }} formatter={(v: any, name: any) => [formatNumber(Number(v)), name]} labelStyle={{ color: '#707070' }} />
            {artists.map((a, i) => (
              <Line key={a.id} type="monotone" dataKey={a.kpis.artistName} stroke={getChartColor(i)} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem' }}>
          {artists.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: getChartColor(i), display: 'inline-block' }} />
              {a.kpis.artistName}
            </div>
          ))}
        </div>
      </div>

      {/* ATD Bar Comparison */}
      <div className="chart-card">
        <h3 style={{ marginBottom: '1rem' }}>All-Time Streams Comparison</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={atdData} layout="vertical" margin={{ left: 80 }}>
            <XAxis type="number" tick={{ fill: '#5a5c72', fontSize: 11 }} tickFormatter={(v: any) => formatNumber(v)} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#8b8da3', fontSize: 12 }} width={70} />
            <Tooltip contentStyle={{ background: '#111113', border: '1px solid #1c1c1f', borderRadius: 8 }} formatter={(v: any) => formatNumber(Number(v))} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {atdData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="home-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><div className="home-loading"><div className="spinner" /></div></div>}>
      <CompareContent />
    </Suspense>
  );
}
