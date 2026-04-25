'use client';
import { useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { DistroKidDataset } from '@/lib/types';

const PLATFORM_COLORS: Record<string, string> = {
  'Spotify': '#1DB954',
  'Apple Music': '#FA243C',
  'YouTube (Red)': '#FF0000',
  'YouTube (Ads)': '#FF4444',
  'TikTok': '#00F2EA',
  'Amazon Unlimited (Streaming)': '#FF9900',
  'Amazon Prime (Streaming)': '#FF9900',
  'Tidal': '#000000',
  'Facebook': '#1877F2',
  'Deezer': '#A238FF',
  'Pandora': '#005483',
  'iTunes': '#EA4CC0',
  'iTunes Songs': '#EA4CC0',
};

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (Math.abs(n) >= 1) return '$' + n.toFixed(2);
  return '$' + n.toFixed(4);
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  DE: 'Germany', FR: 'France', JP: 'Japan', BR: 'Brazil', MX: 'Mexico',
  IN: 'India', CN: 'China', KR: 'South Korea', NG: 'Nigeria', ZA: 'South Africa',
  PH: 'Philippines', ID: 'Indonesia', TH: 'Thailand', SE: 'Sweden', NL: 'Netherlands',
  IT: 'Italy', ES: 'Spain', PL: 'Poland', TR: 'Turkey', RU: 'Russia',
  SG: 'Singapore', NZ: 'New Zealand', IE: 'Ireland', BE: 'Belgium', AT: 'Austria',
  CH: 'Switzerland', PT: 'Portugal', DK: 'Denmark', NO: 'Norway', FI: 'Finland',
  AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru', TW: 'Taiwan',
  HK: 'Hong Kong', MY: 'Malaysia', VN: 'Vietnam', EG: 'Egypt', KE: 'Kenya',
};

export default function RevenuePanel({ data }: { data: DistroKidDataset }) {
  const [songLimit, setSongLimit] = useState(25);
  const [countryLimit, setCountryLimit] = useState(15);

  // Blended CPM — ONLY Apple Music + Spotify
  const CORE_PLATFORMS = ['Spotify', 'Apple Music'];
  const corePlatforms = data.platformBreakdown.filter((p) => CORE_PLATFORMS.includes(p.store));
  const coreEarnings = corePlatforms.reduce((s, p) => s + p.earnings, 0);
  const coreStreams = corePlatforms.reduce((s, p) => s + p.streams, 0);
  const blendedCpm = coreStreams > 0
    ? Math.round((coreEarnings / coreStreams) * 1000 * 100) / 100
    : 0;

  // All-platform CPM for reference
  const allPlatformCpm = data.totalStreams > 0
    ? Math.round((data.totalEarnings / data.totalStreams) * 1000 * 100) / 100
    : 0;

  // Average monthly revenue
  const avgMonthly = data.monthlyRevenue.length > 0
    ? data.totalEarnings / data.monthlyRevenue.length
    : 0;

  // Top platform
  const topPlatform = data.platformBreakdown[0];

  // Recent trend (last 3 months vs prior 3)
  const recent3 = data.monthlyRevenue.slice(-3);
  const prior3 = data.monthlyRevenue.slice(-6, -3);
  const recent3Avg = recent3.length > 0 ? recent3.reduce((s, m) => s + m.earnings, 0) / recent3.length : 0;
  const prior3Avg = prior3.length > 0 ? prior3.reduce((s, m) => s + m.earnings, 0) / prior3.length : 0;
  const trendPct = prior3Avg > 0 ? ((recent3Avg - prior3Avg) / prior3Avg) * 100 : 0;

  return (
    <div>
      <div className="panel-header">
        <h2>Revenue & Platform Intelligence</h2>
        <p>Actual earnings from DistroKid — {data.dateRange[0]} to {data.dateRange[1]}</p>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="stat-card highlight animate-in">
          <div className="stat-card-label">Total Earnings</div>
          <div className="stat-card-value">${data.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="stat-card-sub">{data.monthlyRevenue.length} months of data</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-1">
          <div className="stat-card-label">Total Streams (All Platforms)</div>
          <div className="stat-card-value">{formatNum(data.totalStreams)}</div>
          <div className="stat-card-sub">Across {data.platformBreakdown.length} platforms</div>
        </div>
        <div className="stat-card highlight animate-in animate-in-delay-2">
          <div className="stat-card-label">Blended CPM (AM + Spotify)</div>
          <div className="stat-card-value">${blendedCpm}</div>
          <div className="stat-card-sub">${(blendedCpm / 1000).toFixed(4)}/stream • Core platforms only</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-3">
          <div className="stat-card-label">All-Platform CPM</div>
          <div className="stat-card-value">${allPlatformCpm}</div>
          <div className="stat-card-sub">Includes YouTube, TikTok, etc.</div>
        </div>
        <div className="stat-card animate-in animate-in-delay-4">
          <div className="stat-card-label">Avg Monthly Revenue</div>
          <div className="stat-card-value">{formatCurrency(avgMonthly)}</div>
          <div className={`stat-card-trend ${trendPct > 0 ? 'trend-up' : trendPct < 0 ? 'trend-down' : ''}`}>
            {trendPct > 0 ? '↑' : trendPct < 0 ? '↓' : '→'} {Math.abs(Math.round(trendPct))}% 3mo trend
          </div>
        </div>
        <div className="stat-card animate-in">
          <div className="stat-card-label">Top Platform</div>
          <div className="stat-card-value">{topPlatform?.store ?? 'N/A'}</div>
          <div className="stat-card-sub">${topPlatform?.earnings.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({topPlatform?.pct}%)</div>
        </div>
      </div>

      {/* Monthly Revenue Timeline */}
      <div className="chart-card animate-in">
        <div className="chart-card-header">
          <h3>Monthly Revenue Timeline</h3>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.monthlyRevenue}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tick={{ fill: '#707070', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1c1c1f' }}
              interval={Math.max(0, Math.floor(data.monthlyRevenue.length / 8))}
            />
            <YAxis
              tick={{ fill: '#707070', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v}`}
            />
            <Tooltip
              contentStyle={{ background: 'rgba(12,13,22,0.92)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, fontSize: 13, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any) => [`$${Number(value).toFixed(2)}`, 'Revenue']) as any}
              labelStyle={{ color: '#8b8da3', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, fontWeight: 600 }}
            />
            <Area type="monotone" dataKey="earnings" stroke="#34d399" strokeWidth={2} fill="url(#revenueGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Platform Breakdown */}
      <div className="chart-card animate-in">
        <div className="chart-card-header">
          <h3>Platform Breakdown</h3>
        </div>
        <div className="platform-list">
          {data.platformBreakdown.map((p) => {
            const maxEarnings = data.platformBreakdown[0]?.earnings ?? 1;
            const barWidth = (p.earnings / maxEarnings) * 100;
            const color = PLATFORM_COLORS[p.store] || '#6366f1';
            return (
              <div key={p.store} className="platform-row">
                <div className="platform-name">{p.store}</div>
                <div className="platform-bar-container">
                  <div className="platform-bar" style={{ width: `${barWidth}%`, background: color }} />
                </div>
                <div className="platform-stats">
                  <span className="platform-earnings">${p.earnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="platform-streams">{formatNum(p.streams)}</span>
                  <span className="platform-cpm">${p.cpm} CPM</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Earners */}
      <div className="chart-card animate-in">
        <div className="chart-card-header">
          <h3>Top Earning Songs</h3>
          <div className="chart-card-controls">
            <button className={`chart-toggle ${songLimit === 10 ? 'active' : ''}`} onClick={() => setSongLimit(10)}>Top 10</button>
            <button className={`chart-toggle ${songLimit === 25 ? 'active' : ''}`} onClick={() => setSongLimit(25)}>Top 25</button>
            <button className={`chart-toggle ${songLimit === 50 ? 'active' : ''}`} onClick={() => setSongLimit(50)}>Top 50</button>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Artist</th>
                <th className="text-right">Earnings</th>
                <th className="text-right">Streams</th>
                <th className="text-right">CPM</th>
                <th>ISRC</th>
              </tr>
            </thead>
            <tbody>
              {data.songEarnings.slice(0, songLimit).map((s, i) => (
                <tr key={s.isrc || s.title}>
                  <td className="mono">{i + 1}</td>
                  <td className="song-title">{s.title}</td>
                  <td className="artist-col">{s.artist}</td>
                  <td className="text-right mono">${s.earnings.toFixed(2)}</td>
                  <td className="text-right mono">{formatNum(s.streams)}</td>
                  <td className="text-right mono">${s.cpm}</td>
                  <td className="mono isrc-col">{s.isrc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Geographic Breakdown */}
      <div className="chart-card animate-in">
        <div className="chart-card-header">
          <h3>Top Markets by Revenue</h3>
          <div className="chart-card-controls">
            <button className={`chart-toggle ${countryLimit === 10 ? 'active' : ''}`} onClick={() => setCountryLimit(10)}>Top 10</button>
            <button className={`chart-toggle ${countryLimit === 15 ? 'active' : ''}`} onClick={() => setCountryLimit(15)}>Top 15</button>
            <button className={`chart-toggle ${countryLimit === 30 ? 'active' : ''}`} onClick={() => setCountryLimit(30)}>Top 30</button>
          </div>
        </div>
        <div className="country-grid">
          {data.countryBreakdown.slice(0, countryLimit).map((c, i) => {
            const maxEarnings = data.countryBreakdown[0]?.earnings ?? 1;
            const barWidth = (c.earnings / maxEarnings) * 100;
            return (
              <div key={c.country} className="country-row">
                <span className="country-rank">{i + 1}</span>
                <span className="country-flag">{c.country}</span>
                <span className="country-name">{COUNTRY_NAMES[c.country] || c.country}</span>
                <div className="country-bar-container">
                  <div className="country-bar" style={{ width: `${barWidth}%` }} />
                </div>
                <span className="country-earnings">${c.earnings.toFixed(2)}</span>
                <span className="country-streams">{formatNum(c.streams)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
