'use client';
import { useState } from 'react';
import type { SongAggregated } from '@/lib/types';
import { formatNumber, formatPct } from '@/lib/utils';

function MiniSparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 70, h = 20;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return <svg width={w} height={h}><polyline points={points} fill="none" stroke="#06b6d4" strokeWidth="1.5" /></svg>;
}

type SortKey = 'atd' | 'ytd' | 'currentWeek' | 'velocity' | 'peakWeek';

export default function SongRankingsPanel({ songs }: { songs: SongAggregated[] }) {
  const [sortBy, setSortBy] = useState<SortKey>('atd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showAll, setShowAll] = useState(false);

  const sorted = [...songs].sort((a, b) => (sortDir === 'desc' ? -1 : 1) * (a[sortBy] - b[sortBy]));
  const display = showAll ? sorted : sorted.slice(0, 25);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };
  const arrow = (key: SortKey) => sortBy === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <div>
      <div className="panel-header">
        <h2>Song Rankings</h2>
        <p>{songs.length} songs • Showing {display.length}</p>
      </div>
      <div className="panel-summary">
        {songs.filter(s => s.trend === 'up').length} songs trending up, {songs.filter(s => s.trend === 'down').length} declining. Click column headers to sort by any metric.
      </div>
      <div className="chart-card">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Song</th>
                <th>Artist</th>
                <th>Trend</th>
                <th>12W</th>
                <th className="text-right" onClick={() => toggleSort('atd')} style={{cursor:'pointer'}}>ATD{arrow('atd')}</th>
                <th className="text-right" onClick={() => toggleSort('ytd')} style={{cursor:'pointer'}}>YTD{arrow('ytd')}</th>
                <th className="text-right" onClick={() => toggleSort('currentWeek')} style={{cursor:'pointer'}}>Week{arrow('currentWeek')}</th>
                <th className="text-right" onClick={() => toggleSort('peakWeek')} style={{cursor:'pointer'}}>Peak{arrow('peakWeek')}</th>
                <th className="text-right" onClick={() => toggleSort('velocity')} style={{cursor:'pointer'}}>Velocity{arrow('velocity')}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {display.map((s, i) => (
                <tr key={s.luminateId}>
                  <td className="mono" style={{ color: 'var(--text-tertiary)' }}>{i + 1}</td>
                  <td className="song-title">{s.title}</td>
                  <td className="artist-col">{s.artist}</td>
                  <td><span className={`trend-badge ${s.trend}`}>{s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→'} {Math.abs(s.trendPct)}%</span></td>
                  <td><MiniSparkline data={s.sparklineData} /></td>
                  <td className="text-right mono">{formatNumber(s.atd)}</td>
                  <td className="text-right mono">{formatNumber(s.ytd)}</td>
                  <td className="text-right mono">{formatNumber(s.currentWeek)}</td>
                  <td className="text-right mono">{formatNumber(s.peakWeek)}</td>
                  <td className="text-right mono">{s.velocity}%</td>
                  <td><span className={`trend-badge ${s.trend}`}>{s.trend === 'up' ? 'Growing' : s.trend === 'down' ? 'Declining' : 'Stable'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {songs.length > 25 && (
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <button className="chart-toggle" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show Top 25' : `Show All ${songs.length}`}</button>
          </div>
        )}
      </div>
    </div>
  );
}
