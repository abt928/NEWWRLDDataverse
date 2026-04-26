'use client';
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { SongAggregated } from '@/lib/types';
import { formatNumber, formatFullNumber, getChartColor } from '@/lib/utils';

const TOOLTIP_STYLE = { background: 'rgba(12,13,22,0.92)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, fontSize: 13, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' } as const;
const LABEL_STYLE = { color: '#8b8da3', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontSize: 11, fontWeight: 600 };

export default function SongTrendsPanel({ songs }: { songs: SongAggregated[] }) {
  const top10 = songs.slice(0, 10);
  const [selected, setSelected] = useState<string[]>(top10.slice(0, 3).map(s => s.luminateId));

  const selectedSongs = songs.filter(s => selected.includes(s.luminateId));

  // Build merged dataset on shared date axis
  const allDates = new Set<string>();
  selectedSongs.forEach(s => s.weeklyData.forEach(w => allDates.add(w.date)));
  const sortedDates = Array.from(allDates).sort();

  const chartData = sortedDates.map(date => {
    const point: Record<string, string | number> = { date };
    selectedSongs.forEach(s => {
      const week = s.weeklyData.find(w => w.date === date);
      point[s.luminateId] = week?.quantity ?? 0;
    });
    return point;
  });

  const toggle = (id: string) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  return (
    <div>
      <div className="panel-header">
        <h2>Song Trends</h2>
        <p>Compare up to 5 songs side by side</p>
      </div>

      <div className="panel-summary">
        Select up to 5 songs from the top 10 to visualize weekly streaming trajectories side by side.
      </div>

      <div className="song-selector">
        {top10.map((s) => (
          <button key={s.luminateId} className={`song-chip ${selected.includes(s.luminateId) ? 'selected' : ''}`}
            style={selected.includes(s.luminateId) ? { '--chip-color': getChartColor(selected.indexOf(s.luminateId)) } as React.CSSProperties : {}}
            onClick={() => toggle(s.luminateId)}>
            {s.title}
          </button>
        ))}
      </div>

      <div className="chart-card animate-in">
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.floor(sortedDates.length / 8)} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={50} />
            <Tooltip contentStyle={TOOLTIP_STYLE}
              formatter={(v: any, name: any) => {
                const song = selectedSongs.find(s => s.luminateId === name);
                return [formatFullNumber(v), song?.title ?? name];
              }}
              labelStyle={LABEL_STYLE} />
            {selectedSongs.map((s, i) => (
              <Line key={s.luminateId} type="monotone" dataKey={s.luminateId} stroke={getChartColor(i)} strokeWidth={2} dot={false} name={s.luminateId} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {selectedSongs.length > 0 && (
          <div className="chart-inline-legend">
            {selectedSongs.map((s, i) => (
              <span key={s.luminateId} className="chart-inline-legend-item">
                <span className="legend-dot" style={{ background: getChartColor(i) }} />
                {s.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
