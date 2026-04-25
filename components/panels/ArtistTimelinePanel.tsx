'use client';
import { useState } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { GrowthMetrics } from '@/lib/types';
import { formatNumber, formatFullNumber } from '@/lib/utils';

export default function ArtistTimelinePanel({ timeline, growth }: { timeline: { date: string; quantity: number }[]; growth: GrowthMetrics }) {
  const [showMA, setShowMA] = useState<'none' | '4w' | '12w'>('none');

  const chartData = growth.weeklyTrend;

  return (
    <div>
      <div className="panel-header">
        <h2>Artist Timeline</h2>
        <p>Weekly streaming volume with optional moving averages</p>
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Weekly Streams</h3>
          <div className="chart-card-controls">
            <button className={`chart-toggle ${showMA === 'none' ? 'active' : ''}`} onClick={() => setShowMA('none')}>Raw</button>
            <button className={`chart-toggle ${showMA === '4w' ? 'active' : ''}`} onClick={() => setShowMA('4w')}>4W MA</button>
            <button className={`chart-toggle ${showMA === '12w' ? 'active' : ''}`} onClick={() => setShowMA('12w')}>12W MA</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 10)} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={55} />
            <Tooltip contentStyle={{ background: 'rgba(12,13,22,0.92)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, fontSize: 13, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }} formatter={(v: any, name: any) => [formatFullNumber(v), name === 'quantity' ? 'Streams' : name === 'ma4' ? '4W Avg' : '12W Avg']} labelStyle={{ color: '#8b8da3', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, fontWeight: 600 }} />
            <Area type="monotone" dataKey="quantity" stroke="#6366f1" strokeWidth={1.5} fill="url(#tlGrad)" />
            {showMA === '4w' && <Line type="monotone" dataKey="ma4" stroke="#10b981" strokeWidth={2} dot={false} />}
            {showMA === '12w' && <Line type="monotone" dataKey="ma12" stroke="#f59e0b" strokeWidth={2} dot={false} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
