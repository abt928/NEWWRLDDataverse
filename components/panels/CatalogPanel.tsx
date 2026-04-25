'use client';
import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Label } from 'recharts';
import type { CatalogComposition } from '@/lib/types';
import { formatNumber, formatPct, getChartColor, CHART_COLORS } from '@/lib/utils';
import PinButton from '../PinButton';

const TOOLTIP_STYLE = { background: 'rgba(12,13,22,0.92)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' } as const;

/** Custom center label for donut charts */
function DonutCenter({ cx, cy, value, label }: { cx: number; cy: number; value: string; label: string }) {
  return (
    <g>
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700">{value}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#5a5c72" fontSize="11" fontWeight="500">{label}</text>
    </g>
  );
}

export default function CatalogPanel({ catalog }: { catalog: CatalogComposition }) {
  const [view, setView] = useState<'releases' | 'songs'>('releases');
  const data = view === 'releases' ? catalog.byRelease : catalog.bySong;

  const totalOwn = catalog.featureVsOwn.own;
  const totalFeat = catalog.featureVsOwn.feature;
  const total = totalOwn + totalFeat;
  const soloPct = total > 0 ? Math.round((totalOwn / total) * 100) : 0;
  const collabPct = total > 0 ? 100 - soloPct : 0;

  const featureSplit = [
    { name: 'Solo', value: totalOwn },
    { name: 'Collabs', value: totalFeat },
  ];
  const typeSplit = [
    { name: 'Singles', value: catalog.singleVsAlbum.singles },
    { name: 'Albums', value: catalog.singleVsAlbum.albums },
  ];
  const typeTotal = catalog.singleVsAlbum.singles + catalog.singleVsAlbum.albums;
  const singlesPct = typeTotal > 0 ? Math.round((catalog.singleVsAlbum.singles / typeTotal) * 100) : 0;

  // Find top concentration stat
  const topConcentration = catalog.concentrationData[0];
  const top3Pct = catalog.concentrationData.find(c => c.label.includes('Top 3'))?.value || 0;

  // Summary line
  const summaryParts: string[] = [];
  if (topConcentration) summaryParts.push(`${topConcentration.label} accounts for ${formatPct(topConcentration.value)} of streams`);
  if (soloPct > 0) summaryParts.push(`${soloPct}% solo work`);
  if (singlesPct > 0) summaryParts.push(`${singlesPct}% singles`);
  const summaryText = summaryParts.join('. ') + '.';

  return (
    <div>
      <div className="panel-header">
        <h2>Catalog Composition</h2>
        <p>How streams distribute across the catalog</p>
      </div>

      <div className="panel-summary">{summaryText}</div>

      <div className="catalog-split-grid">
        <div className="chart-card animate-in">
          <PinButton metricKey="catalog.ownership" />
          <div className="chart-card-header"><h3>Solo vs Collaborations</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={featureSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} startAngle={90} endAngle={-270}>
                <Cell fill="#6366f1" /><Cell fill="#06b6d4" />
                <Label content={({ viewBox }) => {
                  const { cx, cy } = viewBox as any;
                  return <DonutCenter cx={cx} cy={cy} value={`${soloPct}%`} label="Solo" />;
                }} position="center" />
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => formatNumber(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-inline-legend chart-inline-legend-center">
            <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-indigo" /> Solo: {formatPct(soloPct)} ({formatNumber(totalOwn)})</span>
            <span className="chart-inline-legend-item"><span className="legend-dot legend-dot-cyan" /> Collabs: {formatPct(collabPct)} ({formatNumber(totalFeat)})</span>
          </div>
        </div>

        <div className="chart-card animate-in animate-in-delay-1">
          <div className="chart-card-header"><h3>Singles vs Albums</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={typeSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} startAngle={90} endAngle={-270}>
                <Cell fill="#10b981" /><Cell fill="#f59e0b" />
                <Label content={({ viewBox }) => {
                  const { cx, cy } = viewBox as any;
                  return <DonutCenter cx={cx} cy={cy} value={`${singlesPct}%`} label="Singles" />;
                }} position="center" />
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

      <div className="chart-card animate-in animate-in-delay-2">
        <PinButton metricKey="catalog.concentration" />
        <div className="chart-card-header">
          <h3>Stream Concentration</h3>
          {top3Pct > 75 && <span className="concentration-warning">⚠ High concentration risk</span>}
        </div>
        {catalog.concentrationData.slice(0, 4).map((c, i) => (
          <div className="concentration-bar" key={c.label}>
            <span className="concentration-bar-label">{c.label}</span>
            <div className="concentration-bar-track">
              <div
                className={`concentration-bar-fill concentration-fill-${i}`}
                style={{ width: `${c.value}%` }}
              />
            </div>
            <span className="concentration-bar-value">{formatPct(c.value)}</span>
          </div>
        ))}
      </div>

      <div className="chart-card animate-in animate-in-delay-3">
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
