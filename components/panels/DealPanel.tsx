'use client';
import { useState, useMemo } from 'react';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import type { DealInsights, OverviewKPIs, DistroKidDataset, LuminateDataset, MonthlyEarning } from '@/lib/types';
import { formatNumber, formatCurrency, formatPct } from '@/lib/utils';
import PinButton from '../PinButton';

interface ManualRevenueEntry { id: string; month: string; amount: number; note: string }

function formatCompact(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export default function DealPanel({ deal, kpis, distrokid, manualRevenue = [], luminateData }: {
  deal: DealInsights; kpis: OverviewKPIs;
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
  const projectionMonths = 24;
  const snapshots = [6, 12, 18, 24]; // month milestones

  const currentAnnualStreams = deal.estimatedAnnualStreams;
  const currentAnnualRevenue = activeCpm ? Math.round((currentAnnualStreams / 1000) * activeCpm) : 0;

  // --- Fan Chart: Historical + Projected ---
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const fanChartData = useMemo(() => {
    // 1. Aggregate historical weekly data into monthly
    const monthlyMap = new Map<string, number>();
    if (luminateData?.artistWeekly) {
      for (const row of luminateData.artistWeekly) {
        const m = row.dateRange.match(/(\d{4})\/(\d{2})/);
        if (m) {
          const key = `${m[1]}-${m[2]}`;
          monthlyMap.set(key, (monthlyMap.get(key) || 0) + row.quantity);
        }
      }
    }
    const historicalMonths = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-18); // Last 18 months of history

    // 2. Build historical data points
    const data: {
      label: string; month: string; historical?: number;
      optimistic?: number; base?: number; pessimistic?: number; severe?: number;
      isProjected: boolean;
    }[] = [];

    for (const [month, streams] of historicalMonths) {
      const [y, m] = month.split('-');
      data.push({
        label: `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y.slice(2)}`,
        month,
        historical: streams,
        isProjected: false,
      });
    }

    // 3. Build projected data points (4 scenarios)
    if (currentAnnualStreams > 0) {
      const now = new Date();
      let baseStreams = currentAnnualStreams / 12;
      const lastHistorical = historicalMonths[historicalMonths.length - 1];
      if (lastHistorical) baseStreams = lastHistorical[1]; // Start from actual last month

      const makeDecay = (annualPct: number) => Math.pow(1 - annualPct / 100, 1 / 12);
      const decayOpt = makeDecay(Math.max(0, decayRate - 5));
      const decayBase = makeDecay(decayRate);
      const decayPess = makeDecay(decayRate + 10);
      const decaySevere = makeDecay(decayRate + 20);

      let sOpt = baseStreams, sBase = baseStreams, sPess = baseStreams, sSevere = baseStreams;

      for (let mo = 1; mo <= projectionMonths; mo++) {
        sOpt *= decayOpt;
        sBase *= decayBase;
        sPess *= decayPess;
        sSevere *= decaySevere;

        const futureDate = new Date(now.getFullYear(), now.getMonth() + mo, 1);
        const monthKey = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
        data.push({
          label: `${MONTHS_SHORT[futureDate.getMonth()]} ${String(futureDate.getFullYear()).slice(2)}`,
          month: monthKey,
          optimistic: Math.round(sOpt),
          base: Math.round(sBase),
          pessimistic: Math.round(sPess),
          severe: Math.round(sSevere),
          isProjected: true,
        });
      }
    }

    return data;
  }, [luminateData, currentAnnualStreams, decayRate]);

  const todayIndex = fanChartData.findIndex(d => d.isProjected);

  // Generate legacy projection data for scenario table
  const projectionData = useMemo(() => {
    if (!activeCpm || currentAnnualStreams <= 0) return [];
    const monthlyDecay = Math.pow(1 - decayRate / 100, 1 / 12);
    const data = [];
    let cumRevenue = 0;
    let streams = currentAnnualStreams / 12;

    for (let mo = 1; mo <= projectionMonths; mo++) {
      const moRevenue = (streams / 1000) * activeCpm;
      cumRevenue += moRevenue;
      data.push({
        month: `M${mo}`,
        monthNum: mo,
        streams: Math.round(streams),
        revenue: Math.round(moRevenue),
        cumRevenue: Math.round(cumRevenue),
      });
      streams *= monthlyDecay;
    }
    return data;
  }, [activeCpm, currentAnnualStreams, decayRate]);

  // Risk scenarios at snapshot months
  const scenarios = useMemo(() => {
    if (!activeCpm || currentAnnualStreams <= 0) return null;
    const cost = parseFloat(acquisitionCost) || 0;
    const runScenario = (annualDecay: number, label: string) => {
      const monthlyDecay = Math.pow(1 - annualDecay / 100, 1 / 12);
      let cumRev = 0; let streams = currentAnnualStreams / 12; let breakEvenMonth = -1;
      const snapshotRevs: Record<number, number> = {};
      for (let mo = 1; mo <= projectionMonths; mo++) {
        const moRev = (streams / 1000) * activeCpm;
        cumRev += moRev;
        if (cost > 0 && breakEvenMonth < 0 && cumRev >= cost) breakEvenMonth = mo;
        if (snapshots.includes(mo)) snapshotRevs[mo] = Math.round(cumRev);
        streams *= monthlyDecay;
      }
      return { label, decay: annualDecay, totalRevenue: Math.round(cumRev), breakEvenMonth, snapshotRevs, roi: cost > 0 ? Math.round(((cumRev - cost) / cost) * 100) : 0 };
    };
    return {
      optimistic: runScenario(Math.max(0, decayRate - 5), 'Optimistic'),
      base: runScenario(decayRate, 'Base Case'),
      pessimistic: runScenario(decayRate + 10, 'Pessimistic'),
      severe: runScenario(decayRate + 20, 'Severe Decline'),
    };
  }, [activeCpm, currentAnnualStreams, decayRate, acquisitionCost]);

  const [localEarnings, setLocalEarnings] = useState<MonthlyEarning[]>([]);

  const addEarning = () => {
    if (!newMonth || !newAmount || Number(newAmount) <= 0) return;
    const earnings = [...localEarnings, { month: newMonth, amount: Number(newAmount) }];
    const map = new Map<string, MonthlyEarning>();
    for (const e of earnings) map.set(e.month, e);
    const sorted = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    setLocalEarnings(sorted);
    setNewMonth(''); setNewAmount('');
  };
  const removeEarning = (month: string) => {
    setLocalEarnings(localEarnings.filter((e) => e.month !== month));
  };

  const FanTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="cpm-chart-tooltip">
        <div className="cpm-chart-tooltip-label">{label}</div>
        {d?.historical != null && (
          <div className="cpm-chart-tooltip-row">
            <span className="cpm-chart-tooltip-dot" data-type="streams" />
            <span>Streams: {d.historical.toLocaleString()}</span>
          </div>
        )}
        {d?.isProjected && (
          <>
            <div className="cpm-chart-tooltip-row">
              <span className="cpm-chart-tooltip-dot" data-type="actual" />
              <span>Optimistic: {(d.optimistic || 0).toLocaleString()}</span>
            </div>
            <div className="cpm-chart-tooltip-row">
              <span className="cpm-chart-tooltip-dot" data-type="streams" />
              <span>Base: {(d.base || 0).toLocaleString()}</span>
            </div>
            <div className="cpm-chart-tooltip-row">
              <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:'#f59e0b',marginRight:6}} />
              <span>Pessimistic: {(d.pessimistic || 0).toLocaleString()}</span>
            </div>
            <div className="cpm-chart-tooltip-row">
              <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:'#f87171',marginRight:6}} />
              <span>Severe: {(d.severe || 0).toLocaleString()}</span>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="panel-header">
        <h2>Deal Intelligence</h2>
        <p>Valuation metrics, acquisition modeling, and catalog risk assessment</p>
      </div>

      <div className="panel-summary">
        {deal.growthClassification === 'Accelerating' ? '✓ Strong upward momentum' : deal.growthClassification === 'Stable' ? '→ Stable trajectory' : '⚠ Declining trend'} — {formatCurrency(deal.revenueEstimateLow)}–{formatCurrency(deal.revenueEstimateHigh)} est. annual revenue. {decayRate}% modeled decay. Top song holds {Math.round(deal.topSongShare)}% of catalog. {activeCpm !== null ? `Calibrated CPM: $${activeCpm.toFixed(2)}.` : ''}
      </div>

      <div className="deal-grid">
        {/* Revenue Estimate Card */}
        <div className="deal-card accent-green">
          <PinButton metricKey="deal.revenueEstimate" />
          <h4>Estimated Annual Revenue</h4>
          <div className="deal-value">{formatCurrency(deal.revenueEstimateLow)} – {formatCurrency(deal.revenueEstimateHigh)}</div>
          <div className="deal-sub">Based on {formatNumber(deal.estimatedAnnualStreams)} projected annual streams</div>
          <div className="deal-sub deal-rate-info">
            CPM range applied via Deal Intelligence defaults
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
            <h3>Acquisition Modeling</h3>
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
              <div className="acq-info-label">6 Mo Revenue</div>
              <div className="acq-info-value">{projectionData[5] ? formatCurrency(projectionData[5].cumRevenue) : '—'}</div>
            </div>
            <div className="acq-info">
              <div className="acq-info-label">24 Mo Total</div>
              <div className="acq-info-value">{projectionData[projectionData.length - 1] ? formatCurrency(projectionData[projectionData.length - 1].cumRevenue) : '—'}</div>
            </div>
          </div>

          {/* Fan Chart: Historical → Projected */}
          {fanChartData.length > 0 && (
            <div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={fanChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fanHistGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fanOptGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fanPessGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fanSevereGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={0.1} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="label" tick={{ fill: '#5a5c72', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: any) => formatNumber(v)} width={55} />
                  <Tooltip content={<FanTooltip />} />
                  {todayIndex > 0 && <ReferenceLine x={fanChartData[todayIndex]?.label} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" label={{ value: 'Today', position: 'top', fill: '#8b8da3', fontSize: 10 }} />}
                  <Area type="monotone" dataKey="historical" stroke="#818cf8" strokeWidth={2} fill="url(#fanHistGrad)" connectNulls={false} dot={false} />
                  <Area type="monotone" dataKey="optimistic" stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 2" fill="url(#fanOptGrad)" connectNulls={false} dot={false} />
                  <Area type="monotone" dataKey="base" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" fill="none" connectNulls={false} dot={false} />
                  <Area type="monotone" dataKey="pessimistic" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" fill="url(#fanPessGrad)" connectNulls={false} dot={false} />
                  <Area type="monotone" dataKey="severe" stroke="#f87171" strokeWidth={1} strokeDasharray="3 3" fill="url(#fanSevereGrad)" connectNulls={false} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="fan-chart-legend">
                <span className="fan-legend-item"><span className="fan-legend-line" style={{background:'#818cf8'}} />Historical</span>
                <span className="fan-legend-item"><span className="fan-legend-line" style={{background:'#34d399'}} />Optimistic</span>
                <span className="fan-legend-item"><span className="fan-legend-line" style={{background:'#6366f1'}} />Base</span>
                <span className="fan-legend-item"><span className="fan-legend-line" style={{background:'#f59e0b'}} />Pessimistic</span>
                <span className="fan-legend-item"><span className="fan-legend-line" style={{background:'#f87171'}} />Severe</span>
              </div>
            </div>
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
                    <th>6 Mo</th>
                    <th>12 Mo</th>
                    <th>18 Mo</th>
                    <th>24 Mo</th>
                    {parseFloat(acquisitionCost) > 0 && <th>Break-Even</th>}
                    {parseFloat(acquisitionCost) > 0 && <th>24M ROI</th>}
                  </tr>
                </thead>
                <tbody>
                  {[scenarios.optimistic, scenarios.base, scenarios.pessimistic, scenarios.severe].map((s) => (
                    <tr key={s.label} className={s.label === 'Base Case' ? 'cpm-row-actual' : ''}>
                      <td className="cpm-month">{s.label}</td>
                      <td className="cpm-streams">{s.decay}%/yr</td>
                      <td className="cpm-amount">{formatCurrency(s.snapshotRevs[6] || 0)}</td>
                      <td className="cpm-amount">{formatCurrency(s.snapshotRevs[12] || 0)}</td>
                      <td className="cpm-amount">{formatCurrency(s.snapshotRevs[18] || 0)}</td>
                      <td className="cpm-amount">{formatCurrency(s.snapshotRevs[24] || 0)}</td>
                      {parseFloat(acquisitionCost) > 0 && (
                        <td className={s.breakEvenMonth > 0 ? 'cpm-cpm' : 'cpm-note'}>
                          {s.breakEvenMonth > 0 ? `Month ${s.breakEvenMonth}` : '> 24mo'}
                        </td>
                      )}
                      {parseFloat(acquisitionCost) > 0 && (
                        <td className={s.roi > 0 ? 'cpm-amount' : 'cpm-note'}>
                          {s.roi > 0 ? `+${s.roi}%` : `${s.roi}%`}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parseFloat(acquisitionCost) > 0 && scenarios.base.breakEvenMonth > 0 && (
                <div className="acq-verdict">
                  At <strong>{decayRate}%</strong> annual decay and <strong>{formatCurrency(parseFloat(acquisitionCost))}</strong> acquisition cost,
                  break-even occurs at <strong>Month {scenarios.base.breakEvenMonth}</strong> with a
                  <strong className={scenarios.base.roi > 50 ? ' text-emerald' : scenarios.base.roi > 0 ? ' text-amber' : ' text-red'}>
                    {' '}{scenarios.base.roi > 0 ? '+' : ''}{scenarios.base.roi}% ROI
                  </strong> over 24 months.
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
          <div className="chart-card-header"><h3>Breakout Songs Detected</h3></div>
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
