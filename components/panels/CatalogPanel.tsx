'use client';
import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import type { CatalogComposition } from '@/lib/types';
import { formatNumber, formatPct, getChartColor, CHART_COLORS } from '@/lib/utils';

export default function CatalogPanel({ catalog }: { catalog: CatalogComposition }) {
  const [view, setView] = useState<'releases' | 'songs'>('releases');
  const data = view === 'releases' ? catalog.byRelease : catalog.bySong;

  const totalOwn = catalog.featureVsOwn.own;
  const totalFeat = catalog.featureVsOwn.feature;
  const total = totalOwn + totalFeat;
  const featureSplit = [
    { name: 'Own Releases', value: totalOwn },
    { name: 'Features', value: totalFeat },
  ];
  const typeSplit = [
    { name: 'Singles', value: catalog.singleVsAlbum.singles },
    { name: 'Albums', value: catalog.singleVsAlbum.albums },
  ];

  return (
    <div>
      <div className="panel-header">
        <h2>Catalog Composition</h2>
        <p>How streams distribute across the catalog</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="chart-card">
          <div className="chart-card-header"><h3>Own vs Features</h3></div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={featureSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                <Cell fill="#6366f1" /><Cell fill="#06b6d4" />
              </Pie>
              <Tooltip contentStyle={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} formatter={(v: any) => formatNumber(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>🟣 Own: {total > 0 ? formatPct(totalOwn / total * 100) : '0%'}</span>
            <span>🔵 Features: {total > 0 ? formatPct(totalFeat / total * 100) : '0%'}</span>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-header"><h3>Singles vs Albums</h3></div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={typeSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                <Cell fill="#10b981" /><Cell fill="#f59e0b" />
              </Pie>
              <Tooltip contentStyle={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} formatter={(v: any) => formatNumber(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>🟢 Singles: {formatNumber(catalog.singleVsAlbum.singles)}</span>
            <span>🟡 Albums: {formatNumber(catalog.singleVsAlbum.albums)}</span>
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Stream Concentration</h3>
          <div className="chart-card-controls">
            {catalog.concentrationData.map(c => (
              <span key={c.label} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.25rem 0.5rem' }}>
                {c.label}: {formatPct(c.value)}
              </span>
            ))}
          </div>
        </div>
        {catalog.concentrationData.slice(0, 4).map((c, i) => (
          <div className="concentration-bar" key={c.label}>
            <span className="concentration-bar-label">{c.label}</span>
            <div className="concentration-bar-track">
              <div className="concentration-bar-fill" style={{ width: `${c.value}%`, background: getChartColor(i) }} />
            </div>
            <span className="concentration-bar-value">{formatPct(c.value)}</span>
          </div>
        ))}
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Stream Distribution by {view === 'releases' ? 'Release' : 'Song'}</h3>
          <div className="chart-card-controls">
            <button className={`chart-toggle ${view === 'releases' ? 'active' : ''}`} onClick={() => setView('releases')}>Releases</button>
            <button className={`chart-toggle ${view === 'songs' ? 'active' : ''}`} onClick={() => setView('songs')}>Songs</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ left: 120 }}>
            <XAxis type="number" tick={{ fill: '#5a5c72', fontSize: 11 }} tickFormatter={(v: any) => formatNumber(v)} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#8b8da3', fontSize: 11 }} width={110} />
            <Tooltip contentStyle={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} formatter={(v: any) => formatNumber(v)} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => <Cell key={i} fill={getChartColor(i)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
