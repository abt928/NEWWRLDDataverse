'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area,
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

function formatFull(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const GEO_COLORS = {
  us: '#6366f1',
  mx: '#34d399',
  other: '#f59e0b',
};

function GeoTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="tooltip-row">
          <span className="tooltip-dot" style={{ background: p.color }} />
          <span className="tooltip-name">{p.name}</span>
          <span className="tooltip-value">{formatFull(p.value)}</span>
        </div>
      ))}
      <div className="tooltip-row tooltip-total">
        <span className="tooltip-dot" style={{ background: 'transparent' }} />
        <span className="tooltip-name">Total</span>
        <span className="tooltip-value">{formatFull(total)}</span>
      </div>
    </div>
  );
}

export default function GeoPanel({ geoBreakdown, geoSummary, activeCpm }: GeoPanelProps) {
  const weeklyData = useMemo(() => {
    return Object.entries(geoBreakdown)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, vals]) => {
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

  const shares = useMemo(() => {
    const total = totals.worldwide || 1;
    return {
      us: Math.round((totals.us / total) * 100),
      mx: Math.round((totals.mx / total) * 100),
      other: Math.round((totals.other / total) * 100),
    };
  }, [totals]);

  const geoRevenue = useMemo(() => {
    if (!activeCpm) return null;
    return {
      worldwide: Math.round((totals.worldwide / 1000) * activeCpm),
      us: Math.round((totals.us / 1000) * activeCpm),
      mx: Math.round((totals.mx / 1000) * activeCpm),
      other: Math.round((totals.other / 1000) * activeCpm),
    };
  }, [totals, activeCpm]);

  const latestWeek = weeklyData[weeklyData.length - 1];
  const prevWeek = weeklyData.length > 1 ? weeklyData[weeklyData.length - 2] : null;

  if (!geoSummary.hasGeoData || weeklyData.length === 0) {
    return (
      <div className="panel-empty-state">
        <div className="empty-state-icon" aria-hidden="true">—</div>
        <h3>No Geographic Data Yet</h3>
        <p>Upload <strong>geo-specific Luminate files</strong> (US, Mexico, etc.) alongside a Worldwide file to see regional breakdowns.</p>
        <a href="/" className="btn-primary geo-empty-link">← Upload Files</a>
      </div>
    );
  }

  return (
    <div>
      <div className="panel-header">
        <h2>Geographic Intelligence</h2>
        <p>Regional streaming distribution and market share analysis</p>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Worldwide</div>
          <div className="kpi-value">{formatCompact(totals.worldwide)}</div>
          <div className="kpi-sub">{formatFull(totals.worldwide)} streams</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">United States</div>
          <div className="kpi-value">{formatCompact(totals.us)}</div>
          <div className="kpi-sub">{shares.us}% of worldwide • {formatFull(totals.us)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Mexico</div>
          <div className="kpi-value">{formatCompact(totals.mx)}</div>
          <div className="kpi-sub">{shares.mx}% of worldwide • {formatFull(totals.mx)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Other Regions</div>
          <div className="kpi-value">{formatCompact(totals.other)}</div>
          <div className="kpi-sub">{shares.other}% of worldwide • {formatFull(totals.other)}</div>
        </div>
      </div>

      {/* Stacked Area Chart */}
      <div className="chart-card">
        <h3>Regional Streams Over Time</h3>
        <div className="geo-legend">
          <span className="geo-legend-item"><span className="geo-legend-dot" style={{ background: GEO_COLORS.us }} />United States</span>
          <span className="geo-legend-item"><span className="geo-legend-dot" style={{ background: GEO_COLORS.mx }} />Mexico</span>
          <span className="geo-legend-item"><span className="geo-legend-dot" style={{ background: GEO_COLORS.other }} />Other</span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={weeklyData}>
            <defs>
              <linearGradient id="geoUsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GEO_COLORS.us} stopOpacity={0.4} />
                <stop offset="100%" stopColor={GEO_COLORS.us} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="geoMxGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GEO_COLORS.mx} stopOpacity={0.4} />
                <stop offset="100%" stopColor={GEO_COLORS.mx} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="geoOtherGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GEO_COLORS.other} stopOpacity={0.3} />
                <stop offset="100%" stopColor={GEO_COLORS.other} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="week" tick={{ fill: '#5a5c72', fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(weeklyData.length / 12))} />
            <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={50} />
            <Tooltip content={<GeoTooltip />} />
            <Area type="monotone" dataKey="us" stackId="geo" stroke={GEO_COLORS.us} strokeWidth={1.5} fill="url(#geoUsGrad)" name="United States" />
            <Area type="monotone" dataKey="mx" stackId="geo" stroke={GEO_COLORS.mx} strokeWidth={1.5} fill="url(#geoMxGrad)" name="Mexico" />
            <Area type="monotone" dataKey="other" stackId="geo" stroke={GEO_COLORS.other} strokeWidth={1.5} fill="url(#geoOtherGrad)" name="Other" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Market Share — latest week */}
      {latestWeek && (
        <div className="chart-card">
          <h3>Latest Week Market Share <span className="chart-card-badge">{latestWeek.week}</span></h3>
          <div className="geo-share-bars">
            {[
              { label: 'United States', key: 'us' as const, color: 'us' },
              { label: 'Mexico', key: 'mx' as const, color: 'mx' },
              { label: 'Other Regions', key: 'other' as const, color: 'other' },
            ].map((region) => {
              const val = latestWeek[region.key];
              const pct = latestWeek.worldwide > 0 ? Math.round(val / latestWeek.worldwide * 100) : 0;
              return (
                <div key={region.key} className="geo-share-row">
                  <span className="geo-share-label">{region.label}</span>
                  <div className="geo-share-track">
                    <div className={`geo-share-fill ${region.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="geo-share-value">{formatFull(val)}</span>
                  <span className="geo-share-pct">{pct}%</span>
                </div>
              );
            })}
          </div>
          {prevWeek && (
            <div className="geo-wow-note">
              Week-over-week: Worldwide {latestWeek.worldwide > prevWeek.worldwide ? '↑' : '↓'}{' '}
              {Math.abs(Math.round(((latestWeek.worldwide - prevWeek.worldwide) / (prevWeek.worldwide || 1)) * 100))}%
              {' • '}Total: {formatFull(latestWeek.worldwide)}
            </div>
          )}
        </div>
      )}

      {/* Revenue by Region */}
      {geoRevenue && (
        <div className="chart-card">
          <h3>Estimated Revenue by Region</h3>
          <p className="chart-subtitle">Based on blended CPM of ${activeCpm?.toFixed(2)}/1K streams</p>
          <div className="geo-revenue-grid">
            <div className="geo-rev-card">
              <div className="geo-rev-region">United States</div>
              <div className="geo-rev-amount">{formatCurrency(geoRevenue.us)}</div>
              <div className="geo-rev-pct">{shares.us}% of total</div>
            </div>
            <div className="geo-rev-card">
              <div className="geo-rev-region">Mexico</div>
              <div className="geo-rev-amount">{formatCurrency(geoRevenue.mx)}</div>
              <div className="geo-rev-pct">{shares.mx}% of total</div>
            </div>
            <div className="geo-rev-card">
              <div className="geo-rev-region">Other</div>
              <div className="geo-rev-amount">{formatCurrency(geoRevenue.other)}</div>
              <div className="geo-rev-pct">{shares.other}% of total</div>
            </div>
            <div className="geo-rev-card geo-rev-total">
              <div className="geo-rev-region">Worldwide Total</div>
              <div className="geo-rev-amount">{formatCurrency(geoRevenue.worldwide)}</div>
              <div className="geo-rev-pct">{weeklyData.length} weeks of data</div>
            </div>
          </div>
        </div>
      )}

      {/* Data Sources */}
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
              return (
                <tr key={loc.location}>
                  <td className="cpm-month">{loc.location}</td>
                  <td className="cpm-streams">{loc.weeks}</td>
                  <td className="cpm-amount">{formatFull(loc.totalStreams)}</td>
                  <td className="cpm-streams">{formatFull(avgWeekly)}</td>
                  {activeCpm && <td className="cpm-cpm">{formatCurrency(Math.round((loc.totalStreams / 1000) * activeCpm))}</td>}
                </tr>
              );
            })}
            {totals.other > 0 && (
              <tr>
                <td className="cpm-month">Other (calculated)</td>
                <td className="cpm-streams">{weeklyData.length}</td>
                <td className="cpm-amount">{formatFull(totals.other)}</td>
                <td className="cpm-streams">{formatFull(Math.round(totals.other / weeklyData.length))}</td>
                {activeCpm && <td className="cpm-cpm">{formatCurrency(Math.round((totals.other / 1000) * activeCpm))}</td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
