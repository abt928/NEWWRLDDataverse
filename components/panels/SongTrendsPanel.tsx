'use client';
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { SongAggregated } from '@/lib/types';
import { formatNumber, formatFullNumber, getChartColor } from '@/lib/utils';

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

      <div className="song-selector">
        {top10.map((s, i) => (
          <button key={s.luminateId} className={`song-chip ${selected.includes(s.luminateId) ? 'selected' : ''}`}
            style={selected.includes(s.luminateId) ? { '--chip-color': getChartColor(selected.indexOf(s.luminateId)) } as React.CSSProperties : {}}
            onClick={() => toggle(s.luminateId)}>
            {s.title}
          </button>
        ))}
      </div>

      <div className="chart-card">
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.floor(sortedDates.length / 8)} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={50} />
            <Tooltip contentStyle={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13 }}
              formatter={(v: any, name: any) => {
                const song = selectedSongs.find(s => s.luminateId === name);
                return [formatFullNumber(v), song?.title ?? name];
              }}
              labelStyle={{ color: '#8b8da3' }} />
            {selectedSongs.map((s, i) => (
              <Line key={s.luminateId} type="monotone" dataKey={s.luminateId} stroke={getChartColor(i)} strokeWidth={2} dot={false} name={s.luminateId} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {selectedSongs.length > 0 && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            {selectedSongs.map((s, i) => (
              <div key={s.luminateId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: getChartColor(i), display: 'inline-block' }} />
                {s.title}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
