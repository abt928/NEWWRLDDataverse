'use client';
import { useState } from 'react';
import type { DealInsights, OverviewKPIs, FilterState, MonthlyEarning, DistroKidDataset } from '@/lib/types';
import { formatNumber, formatCurrency, formatPct } from '@/lib/utils';

export default function DealPanel({ deal, kpis, filters, onChange, distrokid }: { deal: DealInsights; kpis: OverviewKPIs; filters: FilterState; onChange: (f: FilterState) => void; distrokid?: DistroKidDataset }) {
  // Blended CPM from DistroKid — ONLY Apple Music + Spotify
  const CORE_PLATFORMS = ['Spotify', 'Apple Music'];
  const corePlatforms = distrokid?.platformBreakdown.filter((p) => CORE_PLATFORMS.includes(p.store)) ?? [];
  const coreEarnings = corePlatforms.reduce((s, p) => s + p.earnings, 0);
  const coreStreams = corePlatforms.reduce((s, p) => s + p.streams, 0);
  const dkCpm = coreStreams > 0
    ? Math.round((coreEarnings / coreStreams) * 1000 * 100) / 100
    : null;
  const dkAnnualRevenue = dkCpm !== null
    ? Math.round((deal.estimatedAnnualStreams / 1000) * dkCpm)
    : null;
  const classMap = { Accelerating: 'accelerating', Stable: 'stable', Declining: 'declining' } as const;
  const [showEarnings, setShowEarnings] = useState(false);
  const [newMonth, setNewMonth] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const addEarning = () => {
    if (!newMonth || !newAmount || Number(newAmount) <= 0) return;
    const earnings = [...filters.actualEarnings, { month: newMonth, amount: Number(newAmount) }];
    // Sort by month and deduplicate (keep latest for same month)
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

  return (
    <div>
      <div className="panel-header">
        <h2>Deal Intelligence</h2>
        <p>Valuation metrics and catalog risk assessment</p>
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

        {/* DistroKid Calibrated Revenue — shown when DK data is available */}
        {dkCpm !== null && dkAnnualRevenue !== null && distrokid && (
          <div className="deal-card accent-purple">
            <h4>Revenue (DistroKid Calibrated)</h4>
            <div className="deal-value">{formatCurrency(dkAnnualRevenue)}</div>
            <div className="deal-sub">Projected annual using real DistroKid earnings</div>
            <div className="deal-sub deal-rate-info">
              Effective CPM: <strong>${dkCpm}</strong> (from ${distrokid.totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2})} across {distrokid.monthlyRevenue.length} months)
            </div>
          </div>
        )}

        {/* Manual Earnings Derived Card — only when no DK data but manual entries exist */}
        {!distrokid && deal.effectiveCpm !== null && deal.revenueFromActuals !== null && (
          <div className="deal-card accent-purple">
            <h4>Revenue from Actuals</h4>
            <div className="deal-value">{formatCurrency(deal.revenueFromActuals)}</div>
            <div className="deal-sub">Projected annual using your manual earnings data</div>
            <div className="deal-sub deal-rate-info">
              Effective CPM: <strong>${deal.effectiveCpm.toFixed(2)}</strong> (derived from {filters.actualEarnings.length} month{filters.actualEarnings.length !== 1 ? 's' : ''})
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
          <div className="deal-sub deal-rate-info">
            Scale: 0 (perfectly distributed) – 10,000 (one song)
          </div>
        </div>

        <div className="deal-card accent-cyan">
          <h4>Feature vs Own Split</h4>
          <div className="deal-value">{formatPct(100 - deal.featureVsOwnPct)} own</div>
          <div className="deal-sub">{formatPct(deal.featureVsOwnPct)} from features & compilations</div>
        </div>
      </div>

      {/* Actual Earnings Input Section */}
      <div className="chart-card earnings-section">
        <div className="chart-card-header">
          <h3>📈 Actual Earnings Calibration</h3>
          <button className="btn-secondary btn-sm" onClick={() => setShowEarnings(!showEarnings)}>
            {showEarnings ? 'Hide' : filters.actualEarnings.length > 0 ? `${filters.actualEarnings.length} month${filters.actualEarnings.length !== 1 ? 's' : ''} entered` : 'Add Earnings'}
          </button>
        </div>
        <p className="earnings-description">
          Enter actual revenue from your streaming platform for specific months. The system will calculate your effective CPM and give you more accurate projections.
        </p>

        {showEarnings && (
          <div className="earnings-form">
            <div className="earnings-input-row">
              <div className="earnings-field">
                <label htmlFor="earning-month" className="filter-label">Month</label>
                <input
                  id="earning-month"
                  type="month"
                  className="filter-input"
                  value={newMonth}
                  onChange={(e) => setNewMonth(e.target.value)}
                />
              </div>
              <div className="earnings-field">
                <label htmlFor="earning-amount" className="filter-label">Amount Earned ($)</label>
                <input
                  id="earning-amount"
                  type="number"
                  className="filter-input"
                  placeholder="e.g. 4500"
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                />
              </div>
              <button className="btn-primary btn-sm" onClick={addEarning} disabled={!newMonth || !newAmount}>
                + Add
              </button>
            </div>

            {filters.actualEarnings.length > 0 && (
              <div className="earnings-table">
                <div className="earnings-header-row">
                  <span>Month</span>
                  <span>Earnings</span>
                  <span></span>
                </div>
                {filters.actualEarnings.map((e) => (
                  <div key={e.month} className="earnings-data-row">
                    <span className="earnings-month">{new Date(e.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                    <span className="earnings-amount">{formatCurrency(e.amount)}</span>
                    <button className="earnings-remove" onClick={() => removeEarning(e.month)} title="Remove">✕</button>
                  </div>
                ))}
                <div className="earnings-total-row">
                  <span>Total</span>
                  <span className="earnings-amount">{formatCurrency(filters.actualEarnings.reduce((s, e) => s + e.amount, 0))}</span>
                  <span></span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
          {deal.revenueFromActuals !== null && (
            <> (or <strong className="text-primary">{formatCurrency(deal.revenueFromActuals)}</strong> based on actual earnings)</>
          )}.{' '}
          Catalog concentration is <strong className="text-primary">{deal.concentrationLabel.toLowerCase()}</strong>{' '}
          with the top song representing {formatPct(deal.topSongShare)} of total streams.
        </div>
      </div>
    </div>
  );
}
