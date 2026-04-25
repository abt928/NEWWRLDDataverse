'use client';
import { useState, useMemo } from 'react';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { DealInsights, OverviewKPIs, FilterState, MonthlyEarning, DistroKidDataset, LuminateDataset } from '@/lib/types';
import { formatNumber, formatCurrency, formatPct } from '@/lib/utils';

interface ManualRevenueEntry { id: string; month: string; amount: number; note: string }

function formatCompact(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export default function DealPanel({ deal, kpis, filters, onChange, distrokid, manualRevenue = [], luminateData }: {
  deal: DealInsights; kpis: OverviewKPIs; filters: FilterState; onChange: (f: FilterState) => void;
  distrokid?: DistroKidDataset; manualRevenue?: ManualRevenueEntry[]; luminateData?: LuminateDataset;
}) {
  // --- CPM Priority: Manual CPM Calculator > DK > Default ---
  // Compute blended CPM from manual revenue entries (CPM Calculator)
  const manualCpm = useMemo(() => {
    if (!manualRevenue.length || !luminateData?.artistWeekly?.length) return null;
    const monthlyStreams = new Map<string, number>();
    for (const row of luminateData.artistWeekly) {
      const m = row.dateRange.match(/(\d{4})\/(\d{2})/);
      if (m) {
        const key = `${m[1]}-${m[2]}`;
        monthlyStreams.set(key, (monthlyStreams.get(key) || 0) + row.quantity);
      }
    }
    let rev = 0, str = 0;
    for (const e of manualRevenue) {
      rev += e.amount;
      str += monthlyStreams.get(e.month) || 0;
    }
    return str > 0 ? Math.round((rev / str) * 1000 * 100) / 100 : null;
  }, [manualRevenue, luminateData]);

  // DK CPM (AM + Spotify)
  const CORE_PLATFORMS = ['Spotify', 'Apple Music'];
  const corePlatforms = distrokid?.platformBreakdown.filter((p) => CORE_PLATFORMS.includes(p.store)) ?? [];
  const coreEarnings = corePlatforms.reduce((s, p) => s + p.earnings, 0);
  const coreStreams = corePlatforms.reduce((s, p) => s + p.streams, 0);
  const dkCpm = coreStreams > 0 ? Math.round((coreEarnings / coreStreams) * 1000 * 100) / 100 : null;

  // Priority CPM
  const activeCpm = manualCpm ?? dkCpm ?? null;
  const cpmSource = manualCpm ? 'CPM Calculator' : dkCpm ? 'DistroKid (AM+Spotify)' : null;

  const dkAnnualRevenue = dkCpm !== null ? Math.round((deal.estimatedAnnualStreams / 1000) * dkCpm) : null;
  const classMap = { Accelerating: 'accelerating', Stable: 'stable', Declining: 'declining' } as const;
  const [showEarnings, setShowEarnings] = useState(false);
  const [newMonth, setNewMonth] = useState('');
  const [newAmount, setNewAmount] = useState('');

  // --- Acquisition Modeling ---
  const [decayRate, setDecayRate] = useState(10); // annual % decay
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const projectionYears = 10;

  const currentAnnualStreams = deal.estimatedAnnualStreams;
  const currentAnnualRevenue = activeCpm ? Math.round((currentAnnualStreams / 1000) * activeCpm) : 0;

  // Generate projection data
  const projectionData = useMemo(() => {
    if (!activeCpm || currentAnnualStreams <= 0) return [];
    const monthlyDecay = Math.pow(1 - decayRate / 100, 1 / 12);
    const data = [];
    let cumRevenue = 0;
    let streams = currentAnnualStreams / 12; // monthly starting streams

    for (let yr = 0; yr < projectionYears; yr++) {
      let yearStreams = 0;
      let yearRevenue = 0;
      for (let mo = 0; mo < 12; mo++) {
        yearStreams += streams;
        yearRevenue += (streams / 1000) * activeCpm;
        streams *= monthlyDecay;
      }
      cumRevenue += yearRevenue;
      data.push({
        year: `Year ${yr + 1}`,
        yearNum: yr + 1,
        streams: Math.round(yearStreams),
        revenue: Math.round(yearRevenue),
        cumRevenue: Math.round(cumRevenue),
      });
    }
    return data;
  }, [activeCpm, currentAnnualStreams, decayRate, projectionYears]);

  // Risk scenarios
  const scenarios = useMemo(() => {
    if (!activeCpm || currentAnnualStreams <= 0) return null;
    const cost = parseFloat(acquisitionCost) || 0;

    const runScenario = (annualDecay: number, label: string) => {
      const monthlyDecay = Math.pow(1 - annualDecay / 100, 1 / 12);
      let cumRev = 0;
      let streams = currentAnnualStreams / 12;
      let breakEvenYear = -1;
      const yearRevs = [];

      for (let yr = 0; yr < projectionYears; yr++) {
        let yrRev = 0;
        for (let mo = 0; mo < 12; mo++) {
          yrRev += (streams / 1000) * activeCpm;
          streams *= monthlyDecay;
        }
        cumRev += yrRev;
        yearRevs.push(Math.round(yrRev));
        if (cost > 0 && breakEvenYear < 0 && cumRev >= cost) {
          breakEvenYear = yr + 1;
        }
      }

      return {
        label,
        decay: annualDecay,
        totalRevenue: Math.round(cumRev),
        breakEvenYear,
        yearRevs,
        roi: cost > 0 ? Math.round(((cumRev - cost) / cost) * 100) : 0,
      };
    };

    return {
      optimistic: runScenario(Math.max(0, decayRate - 5), 'Optimistic'),
      base: runScenario(decayRate, 'Base Case'),
      pessimistic: runScenario(decayRate + 10, 'Pessimistic'),
      severe: runScenario(decayRate + 20, 'Severe Decline'),
    };
  }, [activeCpm, currentAnnualStreams, decayRate, acquisitionCost, projectionYears]);

  const addEarning = () => {
    if (!newMonth || !newAmount || Number(newAmount) <= 0) return;
    const earnings = [...filters.actualEarnings, { month: newMonth, amount: Number(newAmount) }];
    const map = new Map<string, MonthlyEarning>();
    for (const e of earnings) map.set(e.month, e);
    const sorted = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    onChange({ ...filters, actualEarnings: sorted });
    setNewMonth('');
    setNewAmount('');
  };

  const removeEarning = (month: string) => {
    onChange({ ...filters, actualEarnings: filters.actualEarnings.filter((e) => e.month !== month) });
  };

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="cpm-chart-tooltip">
        <div className="cpm-chart-tooltip-label">{label}</div>
        <div className="cpm-chart-tooltip-row">
          <span className="cpm-chart-tooltip-dot" data-type="actual" />
          <span>Revenue: {formatCurrency(d?.revenue || 0)}</span>
        </div>
        <div className="cpm-chart-tooltip-row">
          <span className="cpm-chart-tooltip-dot" data-type="streams" />
          <span>Streams: {(d?.streams || 0).toLocaleString()}</span>
        </div>
        <div className="cpm-chart-tooltip-row">
          <span>Cumulative: {formatCurrency(d?.cumRevenue || 0)}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="panel-header">
        <h2>Deal Intelligence</h2>
        <p>Valuation metrics, acquisition modeling, and catalog risk assessment</p>
      </div>

      <div className="deal-grid">
        {/* Revenue Estimate Card */}
        <div className="deal-card accent-green">
          <h4>Estimated Annual Revenue</h4>
          <div className="deal-value">{formatCurrency(deal.revenueEstimateLow)} – {formatCurrency(deal.revenueEstimateHigh)}</div>
          <div className="deal-sub">Based on {formatNumber(deal.estimatedAnnualStreams)} projected annual streams</div>
          <div className="deal-sub deal-rate-info">
            CPM: ${filters.cpmLow.toFixed(2)} – ${filters.cpmHigh.toFixed(2)} per 1K streams
          </div>
        </div>

        {/* CPM Calculator Calibrated */}
        {activeCpm !== null && (
          <div className="deal-card accent-purple">
            <h4>Revenue ({cpmSource})</h4>
            <div className="deal-value">{formatCurrency(currentAnnualRevenue)}</div>
            <div className="deal-sub">Projected annual using {cpmSource}</div>
            <div className="deal-sub deal-rate-info">
              Active CPM: <strong>${activeCpm}</strong>
            </div>
          </div>
        )}

        <div className="deal-card accent-indigo">
          <h4>Growth Classification</h4>
          <div className="deal-classification">
            <span className={`classification-badge ${classMap[deal.growthClassification]}`}>{deal.growthClassification}</span>
          </div>
          <div className="deal-sub deal-basis">Based on trailing 12W vs prior 12W comparison</div>
        </div>

        <div className="deal-card accent-amber">
          <h4>Catalog Concentration (HHI)</h4>
          <div className="deal-value">{deal.catalogConcentrationIndex.toLocaleString()}</div>
          <div className="deal-sub">{deal.concentrationLabel}</div>
          <div className="deal-sub deal-rate-info">Scale: 0 (perfectly distributed) – 10,000 (one song)</div>
        </div>

        <div className="deal-card accent-cyan">
          <h4>Feature vs Own Split</h4>
          <div className="deal-value">{formatPct(100 - deal.featureVsOwnPct)} own</div>
          <div className="deal-sub">{formatPct(deal.featureVsOwnPct)} from features &amp; compilations</div>
        </div>
      </div>

      {/* ===== ACQUISITION MODELING ===== */}
      {activeCpm !== null && (
        <div className="chart-card acq-model-section">
          <div className="chart-card-header">
            <h3>📊 Acquisition Modeling</h3>
            <span className="panel-subtitle">Powered by {cpmSource} • CPM: ${activeCpm}</span>
          </div>

          <div className="acq-controls">
            <div className="cpm-field">
              <label>Annual Decay Rate (%)</label>
              <input type="number" min="0" max="50" step="1" value={decayRate} onChange={(e) => setDecayRate(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))} />
            </div>
            <div className="cpm-field">
              <label>Acquisition Cost ($)</label>
              <input type="number" min="0" step="1000" placeholder="e.g., 50000" value={acquisitionCost} onChange={(e) => setAcquisitionCost(e.target.value)} />
            </div>
            <div className="acq-info">
              <div className="acq-info-label">Year 1 Revenue</div>
              <div className="acq-info-value">{projectionData[0] ? formatCurrency(projectionData[0].revenue) : '—'}</div>
            </div>
            <div className="acq-info">
              <div className="acq-info-label">10Y Total</div>
              <div className="acq-info-value">{projectionData[projectionData.length - 1] ? formatCurrency(projectionData[projectionData.length - 1].cumRevenue) : '—'}</div>
            </div>
          </div>

          {/* Projection Chart */}
          {projectionData.length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={projectionData}>
                <defs>
                  <linearGradient id="dealRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dealCumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="rev" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatCompact(v)} width={55} />
                <YAxis yAxisId="cum" orientation="right" tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatCompact(v)} width={55} />
                <Tooltip content={<ChartTooltip />} />
                <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#34d399" strokeWidth={2} fill="url(#dealRevGrad)" />
                <Area yAxisId="cum" type="monotone" dataKey="cumRevenue" stroke="#6366f1" strokeWidth={2} fill="url(#dealCumGrad)" />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Scenario / Risk Table */}
          {scenarios && (
            <div className="acq-scenarios">
              <h4>Risk Scenarios</h4>
              <table className="cpm-table">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Decay</th>
                    <th>10Y Revenue</th>
                    {parseFloat(acquisitionCost) > 0 && <th>Break-Even</th>}
                    {parseFloat(acquisitionCost) > 0 && <th>10Y ROI</th>}
                    <th>Yr 1</th>
                    <th>Yr 3</th>
                    <th>Yr 5</th>
                  </tr>
                </thead>
                <tbody>
                  {[scenarios.optimistic, scenarios.base, scenarios.pessimistic, scenarios.severe].map((s) => (
                    <tr key={s.label} className={s.label === 'Base Case' ? 'cpm-row-actual' : ''}>
                      <td className="cpm-month">{s.label}</td>
                      <td className="cpm-streams">{s.decay}%/yr</td>
                      <td className="cpm-amount">{formatCurrency(s.totalRevenue)}</td>
                      {parseFloat(acquisitionCost) > 0 && (
                        <td className={s.breakEvenYear > 0 ? 'cpm-cpm' : 'cpm-note'}>
                          {s.breakEvenYear > 0 ? `Year ${s.breakEvenYear}` : 'Never'}
                        </td>
                      )}
                      {parseFloat(acquisitionCost) > 0 && (
                        <td className={s.roi > 0 ? 'cpm-amount' : 'cpm-note'}>
                          {s.roi > 0 ? `+${s.roi}%` : `${s.roi}%`}
                        </td>
                      )}
                      <td className="cpm-streams">{formatCurrency(s.yearRevs[0] || 0)}</td>
                      <td className="cpm-streams">{formatCurrency(s.yearRevs[2] || 0)}</td>
                      <td className="cpm-streams">{formatCurrency(s.yearRevs[4] || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parseFloat(acquisitionCost) > 0 && scenarios.base.breakEvenYear > 0 && (
                <div className="acq-verdict">
                  At <strong>{decayRate}%</strong> annual decay and <strong>{formatCurrency(parseFloat(acquisitionCost))}</strong> acquisition cost,
                  break-even occurs in <strong>Year {scenarios.base.breakEvenYear}</strong> with a
                  <strong className={scenarios.base.roi > 50 ? ' text-emerald' : scenarios.base.roi > 0 ? ' text-amber' : ' text-red'}>
                    {' '}{scenarios.base.roi > 0 ? '+' : ''}{scenarios.base.roi}% ROI
                  </strong> over 10 years.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Song Concentration */}
      <div className="chart-card">
        <div className="chart-card-header"><h3>Song Concentration Analysis</h3></div>
        <div className="concentration-grid">
          <div className="concentration-item">
            <div className={`concentration-value ${deal.topSongShare > 40 ? 'danger' : deal.topSongShare > 25 ? 'warning' : 'good'}`}>
              {formatPct(deal.topSongShare)}
            </div>
            <div className="concentration-label">Top 1 Song Share</div>
          </div>
          <div className="concentration-item">
            <div className={`concentration-value ${deal.top3SongShare > 70 ? 'danger' : deal.top3SongShare > 50 ? 'warning' : 'good'}`}>
              {formatPct(deal.top3SongShare)}
            </div>
            <div className="concentration-label">Top 3 Songs Share</div>
          </div>
          <div className="concentration-item">
            <div className={`concentration-value ${deal.top5SongShare > 85 ? 'danger' : deal.top5SongShare > 65 ? 'warning' : 'good'}`}>
              {formatPct(deal.top5SongShare)}
            </div>
            <div className="concentration-label">Top 5 Songs Share</div>
          </div>
        </div>
      </div>

      {deal.breakoutSongs.length > 0 && (
        <div className="chart-card">
          <div className="chart-card-header"><h3>🔥 Breakout Songs Detected</h3></div>
          {deal.breakoutSongs.map(s => (
            <div key={s.title} className="breakout-row">
              <span>{s.title} <span className="text-secondary">by {s.artist}</span></span>
              <span className="trend-badge up">+{s.growthRate}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="chart-card deal-summary-card">
        <h3>Quick Summary</h3>
        <div className="deal-summary-text">
          <strong className="text-primary">{kpis.artistName}</strong> has accumulated{' '}
          <strong className="text-primary">{formatNumber(kpis.totalATD)}</strong> all-time streams across{' '}
          <strong className="text-primary">{kpis.totalSongs}</strong> songs. The catalog is currently{' '}
          <strong className={deal.growthClassification === 'Accelerating' ? 'text-emerald' : deal.growthClassification === 'Declining' ? 'text-red' : 'text-amber'}>
            {deal.growthClassification.toLowerCase()}
          </strong>{' '}
          with projected annual revenue of{' '}
          <strong className="text-primary">{formatCurrency(deal.revenueEstimateLow)} – {formatCurrency(deal.revenueEstimateHigh)}</strong>
          {activeCpm !== null && (
            <> (or <strong className="text-primary">{formatCurrency(currentAnnualRevenue)}</strong> based on {cpmSource})</>
          )}.{' '}
          Catalog concentration is <strong className="text-primary">{deal.concentrationLabel.toLowerCase()}</strong>{' '}
          with the top song representing {formatPct(deal.topSongShare)} of total streams.
        </div>
      </div>
    </div>
  );
}
