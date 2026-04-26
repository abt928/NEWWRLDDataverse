'use client';
import { useState } from 'react';
import type { ReleaseGroupAggregated } from '@/lib/types';
import { formatNumber, formatPct } from '@/lib/utils';

function MiniSparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 80, h = 24;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="mini-sparkline">
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="1.5" />
    </svg>
  );
}

type SortKey = 'atd' | 'ytd' | 'currentWeek' | 'pctOfCatalog' | 'avgWeeklyStreams' | 'decayRate';

export default function ReleaseTablePanel({ releases }: { releases: ReleaseGroupAggregated[] }) {
  const [sortBy, setSortBy] = useState<SortKey>('atd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...releases].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1;
    return (a[sortBy] - b[sortBy]) * mul;
  });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const arrow = (key: SortKey) => sortBy === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <div>
      <div className="panel-header">
        <h2>Release Performance</h2>
        <p>{releases.length} releases sorted by {sortBy}</p>
      </div>
      <div className="panel-summary">
        {releases.length} releases tracked. {releases.filter(r => r.decayRate > 5).length} growing, {releases.filter(r => r.decayRate < -5).length} declining, {releases.filter(r => r.decayRate >= -5 && r.decayRate <= 5).length} stable. Click column headers to sort.
      </div>
      <div className="chart-card">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Artist</th>
                <th>Type</th>
                <th>Trend (12W)</th>
                <th className="text-right" onClick={() => toggleSort('atd')} style={{cursor:'pointer'}}>ATD{arrow('atd')}</th>
                <th className="text-right" onClick={() => toggleSort('ytd')} style={{cursor:'pointer'}}>YTD{arrow('ytd')}</th>
                <th className="text-right" onClick={() => toggleSort('currentWeek')} style={{cursor:'pointer'}}>This Week{arrow('currentWeek')}</th>
                <th className="text-right" onClick={() => toggleSort('pctOfCatalog')} style={{cursor:'pointer'}}>% Catalog{arrow('pctOfCatalog')}</th>
                <th className="text-right" onClick={() => toggleSort('avgWeeklyStreams')} style={{cursor:'pointer'}}>Avg/Week{arrow('avgWeeklyStreams')}</th>
                <th className="text-right" onClick={() => toggleSort('decayRate')} style={{cursor:'pointer'}}>Decay{arrow('decayRate')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.luminateId}>
                  <td className="song-title">{r.title}</td>
                  <td className="artist-col">{r.artist}</td>
                  <td><span className="trend-badge flat">{r.releaseType}</span></td>
                  <td className="sparkline-cell"><MiniSparkline data={r.sparklineData} /></td>
                  <td className="text-right mono">{formatNumber(r.atd)}</td>
                  <td className="text-right mono">{formatNumber(r.ytd)}</td>
                  <td className="text-right mono">{formatNumber(r.currentWeek)}</td>
                  <td className="text-right mono">{formatPct(r.pctOfCatalog)}</td>
                  <td className="text-right mono">{formatNumber(r.avgWeeklyStreams)}</td>
                  <td className="text-right">
                    <span className={`trend-badge ${r.decayRate > 5 ? 'up' : r.decayRate < -5 ? 'down' : 'flat'}`}>
                      {r.decayRate > 0 ? '+' : ''}{r.decayRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
