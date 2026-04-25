'use client';
import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import type { CatalogComposition } from '@/lib/types';
import { formatNumber, formatPct, getChartColor, CHART_COLORS } from '@/lib/utils';
import PinButton from '../PinButton';

const TOOLTIP_STYLE = { background: 'rgba(12,13,22,0.92)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' } as const;

export default function CatalogPanel({ catalog }: { catalog: CatalogComposition }) {
  const [view, setView] = useState<'releases' | 'songs'>('releases');
  const data = view === 'releases' ? catalog.byRelease : catalog.bySong;

  const totalOwn = catalog.featureVsOwn.own;
  const totalFeat = catalog.featureVsOwn.feature;
  const total = totalOwn + totalFeat;
  const featureSplit = [
    { name: 'Solo', value: totalOwn },
    { name: 'Collabs', value: totalFeat },
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

      <div className="catalog-split-grid">
        <div className="chart-card animate-in">
          <PinButton metricKey="catalog.ownership" />
          <div className="chart-card-header"><h3>Solo vs Collaborations</h3></div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={featureSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                <Cell fill="#6366f1" /><Cell fill="#06b6d4" />
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => formatNumber(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-inline-legend chart-inline-legend-center">
            <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-indigo" /> Solo: {total > 0 ? formatPct(totalOwn / total * 100) : '0%'}</span>
            <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-cyan" /> Collabs: {total > 0 ? formatPct(totalFeat / total * 100) : '0%'}</span>
          </div>
        </div>

        <div className="chart-card animate-in animate-in-delay-1">
          <div className="chart-card-header"><h3>Singles vs Albums</h3></div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={typeSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                <Cell fill="#10b981" /><Cell fill="#f59e0b" />
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => formatNumber(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-inline-legend chart-inline-legend-center">
            <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-emerald" /> Singles: {formatNumber(catalog.singleVsAlbum.singles)}</span>
            <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-amber" /> Albums: {formatNumber(catalog.singleVsAlbum.albums)}</span>
          </div>
        </div>
      </div>

      <div className="chart-card animate-in">
        <div className="chart-card-header">
          <h3>Stream Concentration</h3>
          <div className="chart-card-controls">
            {catalog.concentrationData.map(c => (
              <span key={c.label} className="concentration-badge">
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

      <div className="chart-card animate-in">
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
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => formatNumber(v)} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => <Cell key={i} fill={getChartColor(i)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
