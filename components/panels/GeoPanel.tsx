'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

interface GeoWeek {
  worldwide: number;
  us: number;
  mx: number;
  other: number;
}

interface GeoSummaryLocation {
  location: string;
  weeks: number;
  totalStreams: number;
}

interface GeoPanelProps {
  geoBreakdown: Record<string, GeoWeek>;
  geoSummary: {
    hasGeoData: boolean;
    locations: GeoSummaryLocation[];
  };
  activeCpm?: number | null;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="tooltip-row">
          <span className="tooltip-dot" style={{ background: p.color }} />
          <span className="tooltip-name">{p.name}</span>
          <span className="tooltip-value">{formatCompact(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function GeoPanel({ geoBreakdown, geoSummary, activeCpm }: GeoPanelProps) {
  // Convert record to sorted array for charting
  const weeklyData = useMemo(() => {
    return Object.entries(geoBreakdown)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, vals]) => {
        // key = "2025-W01" → display as "W01"
        const weekLabel = key.replace(/^\d{4}-/, '');
        return {
          week: weekLabel,
          worldwide: vals.worldwide,
          us: vals.us,
          mx: vals.mx,
          other: vals.other,
        };
      });
  }, [geoBreakdown]);

  // Compute totals
  const totals = useMemo(() => {
    const t = { worldwide: 0, us: 0, mx: 0, other: 0 };
    for (const w of weeklyData) {
      t.worldwide += w.worldwide;
      t.us += w.us;
      t.mx += w.mx;
      t.other += w.other;
    }
    return t;
  }, [weeklyData]);

  // Compute % share
  const shares = useMemo(() => {
    const total = totals.worldwide || 1;
    return {
      us: Math.round((totals.us / total) * 100),
      mx: Math.round((totals.mx / total) * 100),
      other: Math.round((totals.other / total) * 100),
    };
  }, [totals]);

  // Compute per-region estimated revenue using active CPM
  const geoRevenue = useMemo(() => {
    if (!activeCpm) return null;
    return {
      worldwide: Math.round((totals.worldwide / 1000) * activeCpm),
      us: Math.round((totals.us / 1000) * activeCpm),
      mx: Math.round((totals.mx / 1000) * activeCpm),
      other: Math.round((totals.other / 1000) * activeCpm),
    };
  }, [totals, activeCpm]);

  // Latest week data
  const latestWeek = weeklyData[weeklyData.length - 1];
  const prevWeek = weeklyData.length > 1 ? weeklyData[weeklyData.length - 2] : null;

  if (!geoSummary.hasGeoData || weeklyData.length === 0) {
    return (
      <div className="panel-empty-state">
        <div className="empty-state-icon">🌍</div>
        <h3>No Geographic Data Yet</h3>
        <p>Upload <strong>geo-specific Luminate files</strong> (US, Mexico, etc.) alongside a Worldwide file to see regional breakdowns.</p>
        <a href="/" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem', fontSize: '0.85rem' }}>← Upload Files</a>
      </div>
    );
  }

  return (
    <>
      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">🌎 Worldwide</div>
          <div className="kpi-value">{formatCompact(totals.worldwide)}</div>
          <div className="kpi-sub">total streams</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">🇺🇸 United States</div>
          <div className="kpi-value">{formatCompact(totals.us)}</div>
          <div className="kpi-sub">{shares.us}% of worldwide</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">🇲🇽 Mexico</div>
          <div className="kpi-value">{formatCompact(totals.mx)}</div>
          <div className="kpi-sub">{shares.mx}% of worldwide</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">🌐 Other Regions</div>
          <div className="kpi-value">{formatCompact(totals.other)}</div>
          <div className="kpi-sub">{shares.other}% of worldwide</div>
        </div>
      </div>

      {/* Stacked Area Chart — geo breakdown over time */}
      <div className="chart-card">
        <h3>Regional Streams Over Time</h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={weeklyData}>
            <defs>
              <linearGradient id="geoUsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="geoMxGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="geoOtherGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="week" tick={{ fill: '#5a5c72', fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(weeklyData.length / 12))} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={50} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="us" stackId="geo" stroke="#6366f1" strokeWidth={1.5} fill="url(#geoUsGrad)" name="🇺🇸 US" />
            <Area type="monotone" dataKey="mx" stackId="geo" stroke="#34d399" strokeWidth={1.5} fill="url(#geoMxGrad)" name="🇲🇽 Mexico" />
            <Area type="monotone" dataKey="other" stackId="geo" stroke="#f59e0b" strokeWidth={1.5} fill="url(#geoOtherGrad)" name="🌐 Other" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Market Share Bar Chart — latest week snapshot */}
      {latestWeek && (
        <div className="chart-card">
          <h3>Latest Week Market Share ({latestWeek.week})</h3>
          <div className="geo-share-bars">
            <div className="geo-share-row">
              <span className="geo-share-label">🇺🇸 United States</span>
              <div className="geo-share-track">
                <div className="geo-share-fill us" style={{ width: `${latestWeek.worldwide > 0 ? (latestWeek.us / latestWeek.worldwide * 100) : 0}%` }} />
              </div>
              <span className="geo-share-value">{formatCompact(latestWeek.us)}</span>
              <span className="geo-share-pct">{latestWeek.worldwide > 0 ? Math.round(latestWeek.us / latestWeek.worldwide * 100) : 0}%</span>
            </div>
            <div className="geo-share-row">
              <span className="geo-share-label">🇲🇽 Mexico</span>
              <div className="geo-share-track">
                <div className="geo-share-fill mx" style={{ width: `${latestWeek.worldwide > 0 ? (latestWeek.mx / latestWeek.worldwide * 100) : 0}%` }} />
              </div>
              <span className="geo-share-value">{formatCompact(latestWeek.mx)}</span>
              <span className="geo-share-pct">{latestWeek.worldwide > 0 ? Math.round(latestWeek.mx / latestWeek.worldwide * 100) : 0}%</span>
            </div>
            <div className="geo-share-row">
              <span className="geo-share-label">🌐 Other</span>
              <div className="geo-share-track">
                <div className="geo-share-fill other" style={{ width: `${latestWeek.worldwide > 0 ? (latestWeek.other / latestWeek.worldwide * 100) : 0}%` }} />
              </div>
              <span className="geo-share-value">{formatCompact(latestWeek.other)}</span>
              <span className="geo-share-pct">{latestWeek.worldwide > 0 ? Math.round(latestWeek.other / latestWeek.worldwide * 100) : 0}%</span>
            </div>
          </div>
          {prevWeek && (
            <div className="geo-wow-note">
              Week-over-week: Worldwide {latestWeek.worldwide > prevWeek.worldwide ? '↑' : '↓'}{' '}
              {Math.abs(Math.round(((latestWeek.worldwide - prevWeek.worldwide) / (prevWeek.worldwide || 1)) * 100))}%
            </div>
          )}
        </div>
      )}

      {/* Estimated Revenue by Region */}
      {geoRevenue && (
        <div className="chart-card">
          <h3>Estimated Revenue by Region</h3>
          <p className="chart-subtitle">Based on blended CPM of ${activeCpm?.toFixed(2)}/1K streams</p>
          <div className="geo-revenue-grid">
            <div className="geo-rev-card">
              <div className="geo-rev-region">🇺🇸 United States</div>
              <div className="geo-rev-amount">{formatCurrency(geoRevenue.us)}</div>
              <div className="geo-rev-pct">{shares.us}% of total</div>
            </div>
            <div className="geo-rev-card">
              <div className="geo-rev-region">🇲🇽 Mexico</div>
              <div className="geo-rev-amount">{formatCurrency(geoRevenue.mx)}</div>
              <div className="geo-rev-pct">{shares.mx}% of total</div>
            </div>
            <div className="geo-rev-card">
              <div className="geo-rev-region">🌐 Other</div>
              <div className="geo-rev-amount">{formatCurrency(geoRevenue.other)}</div>
              <div className="geo-rev-pct">{shares.other}% of total</div>
            </div>
            <div className="geo-rev-card geo-rev-total">
              <div className="geo-rev-region">🌎 Worldwide Total</div>
              <div className="geo-rev-amount">{formatCurrency(geoRevenue.worldwide)}</div>
              <div className="geo-rev-pct">{weeklyData.length} weeks</div>
            </div>
          </div>
        </div>
      )}

      {/* Data Sources Summary */}
      <div className="chart-card">
        <h3>Data Sources</h3>
        <table className="cpm-table">
          <thead>
            <tr>
              <th>Region</th>
              <th>Weeks</th>
              <th>Total Streams</th>
              <th>Avg Weekly</th>
              {activeCpm && <th>Est. Revenue</th>}
            </tr>
          </thead>
          <tbody>
            {geoSummary.locations.map((loc) => {
              const avgWeekly = loc.weeks > 0 ? Math.round(loc.totalStreams / loc.weeks) : 0;
              const flag = loc.location === 'Worldwide' ? '🌎' : loc.location === 'United States' ? '🇺🇸' : loc.location === 'Mexico' ? '🇲🇽' : '📍';
              return (
                <tr key={loc.location}>
                  <td className="cpm-month">{flag} {loc.location}</td>
                  <td className="cpm-streams">{loc.weeks}</td>
                  <td className="cpm-amount">{formatCompact(loc.totalStreams)}</td>
                  <td className="cpm-streams">{formatCompact(avgWeekly)}</td>
                  {activeCpm && <td className="cpm-cpm">{formatCurrency(Math.round((loc.totalStreams / 1000) * activeCpm))}</td>}
                </tr>
              );
            })}
            {totals.other > 0 && (
              <tr>
                <td className="cpm-month">🌐 Other (calculated)</td>
                <td className="cpm-streams">{weeklyData.length}</td>
                <td className="cpm-amount">{formatCompact(totals.other)}</td>
                <td className="cpm-streams">{formatCompact(Math.round(totals.other / weeklyData.length))}</td>
                {activeCpm && <td className="cpm-cpm">{formatCurrency(Math.round((totals.other / 1000) * activeCpm))}</td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
