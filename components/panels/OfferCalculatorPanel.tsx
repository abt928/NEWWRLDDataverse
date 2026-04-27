'use client';

import { useState, useMemo } from 'react';
import type { DistroKidDataset } from '@/lib/types';
import { calculateDeal, DEFAULT_INPUTS, type DealInputs, type DealOutput, type SongData, type MonthlyData } from '@/lib/deal-engine';

interface OfferCalculatorPanelProps {
  distrokid?: DistroKidDataset;
}

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};

const fmtNum = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

export default function OfferCalculatorPanel({ distrokid }: OfferCalculatorPanelProps) {
  const [inputs, setInputs] = useState<DealInputs>(DEFAULT_INPUTS);

  // Reconstruct SongData[] and MonthlyData[] from DK dataset
  const songData: SongData[] = useMemo(() => {
    if (!distrokid?.songEarnings) return [];
    return distrokid.songEarnings.map((s: { title: string; earnings: number; streams: number }) => ({
      title: s.title,
      earnings: s.earnings || 0,
      streams: s.streams || 0,
    })).sort((a: SongData, b: SongData) => b.earnings - a.earnings);
  }, [distrokid]);

  const monthlyData: MonthlyData[] = useMemo(() => {
    if (!distrokid?.monthlyRevenue) return [];
    return distrokid.monthlyRevenue.map((m: { month: string; earnings: number; streams: number }) => ({
      month: m.month,
      earnings: m.earnings,
      streams: m.streams || 0,
    })).sort((a: MonthlyData, b: MonthlyData) => a.month.localeCompare(b.month));
  }, [distrokid]);

  const deal: DealOutput | null = useMemo(() => {
    if (songData.length === 0) return null;
    return calculateDeal(songData, monthlyData, inputs);
  }, [songData, monthlyData, inputs]);

  const update = (patch: Partial<DealInputs>) =>
    setInputs(prev => ({ ...prev, ...patch }));

  if (!distrokid || songData.length === 0) {
    return (
      <div className="panel-empty-state">
        <div className="empty-state-icon" aria-hidden="true">—</div>
        <h3>No Revenue Data</h3>
        <p>Drop a <strong>DistroKid (.zip)</strong> file on the home page to unlock the offer calculator.</p>
        <a href="/" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem', fontSize: '0.85rem' }}>← Upload Files</a>
      </div>
    );
  }

  return (
    <div className="calc-panel">
      {/* ── KPI Row ── */}
      {deal && (
        <div className="calc-panel-kpis">
          <div className="calc-panel-kpi calc-panel-kpi-primary">
            <span className="calc-panel-kpi-val">{fmt(deal.totalDealValue)}</span>
            <span className="calc-panel-kpi-label">Total Deal Value</span>
          </div>
          <div className="calc-panel-kpi">
            <span className="calc-panel-kpi-val">{fmt(deal.annualRevenue)}</span>
            <span className="calc-panel-kpi-label">Annual Revenue</span>
          </div>
          <div className="calc-panel-kpi">
            <span className="calc-panel-kpi-val">{fmtNum(deal.totalStreams)}</span>
            <span className="calc-panel-kpi-label">Total Streams</span>
          </div>
          <div className="calc-panel-kpi">
            <span className="calc-panel-kpi-val">${deal.cpm}</span>
            <span className="calc-panel-kpi-label">CPM</span>
          </div>
          <div className="calc-panel-kpi">
            <span className="calc-panel-kpi-val">{deal.songsInCatalog}</span>
            <span className="calc-panel-kpi-label">Songs</span>
          </div>
          <div className="calc-panel-kpi">
            <span className="calc-panel-kpi-val">{deal.catalogMonths}mo</span>
            <span className="calc-panel-kpi-label">Catalog History</span>
          </div>
        </div>
      )}

      <div className="calc-panel-grid">
        {/* ── LEFT: Controls ── */}
        <div className="calc-panel-controls">
          <h3 className="calc-panel-section-title">Deal Parameters</h3>

          {/* Back Catalog */}
          <div className="calc-panel-ctrl">
            <div className="calc-panel-ctrl-head">
              <span>Back Catalog</span>
              {deal && <span className="calc-panel-ctrl-value">{fmt(deal.backCatalogValue)}</span>}
            </div>
            <div className="calc-panel-slider-wrap">
              <label>{inputs.backCatalogCount} of {deal?.songsInCatalog ?? songData.length} songs</label>
              <input type="range" min={0} max={deal?.songsInCatalog ?? songData.length}
                value={inputs.backCatalogCount}
                onChange={e => update({ backCatalogCount: +e.target.value })} />
            </div>
          </div>

          {/* Front Catalog */}
          <div className="calc-panel-ctrl">
            <div className="calc-panel-ctrl-head">
              <span>Front Catalog</span>
              {deal && <span className="calc-panel-ctrl-value">{fmt(deal.frontCatalogValue)}</span>}
            </div>
            <div className="calc-panel-slider-wrap">
              <label>{inputs.frontCatalogCount} new songs</label>
              <input type="range" min={0} max={30} value={inputs.frontCatalogCount}
                onChange={e => update({ frontCatalogCount: +e.target.value })} />
            </div>
          </div>

          {/* Exclusivity */}
          <div className="calc-panel-ctrl">
            <div className="calc-panel-ctrl-head"><span>Exclusivity Period</span></div>
            <div className="calc-panel-toggles">
              {([3, 6, 12, 18, 24] as const).map(m => (
                <button key={m} className={`calc-panel-toggle ${inputs.exclusivityMonths === m ? 'active' : ''}`}
                  onClick={() => update({ exclusivityMonths: m })}>{m}mo</button>
              ))}
            </div>
          </div>

          {/* Artist Royalty */}
          <div className="calc-panel-ctrl">
            <div className="calc-panel-ctrl-head">
              <span>Artist Royalty</span>
              <span className="calc-panel-ctrl-value">{inputs.artistRoyaltyPct}%</span>
            </div>
            <div className="calc-panel-slider-wrap">
              <input type="range" min={20} max={85} value={inputs.artistRoyaltyPct}
                onChange={e => update({ artistRoyaltyPct: +e.target.value })} />
            </div>
          </div>

          {/* Options */}
          <div className="calc-panel-ctrl">
            <div className="calc-panel-ctrl-head">
              <span>Options</span>
              {deal && deal.totalOptionsValue > 0 && <span className="calc-panel-ctrl-value">{fmt(deal.totalOptionsValue)}</span>}
            </div>
            <div className="calc-panel-toggles">
              {([0, 1, 2, 3, 4] as const).map(n => (
                <button key={n} className={`calc-panel-toggle ${inputs.optionCount === n ? 'active' : ''}`}
                  onClick={() => update({ optionCount: n })}>{n}</button>
              ))}
            </div>
            {inputs.optionCount > 0 && (
              <div className="calc-panel-toggles calc-panel-sub">
                {([8, 12, 16] as const).map(m => (
                  <button key={m} className={`calc-panel-toggle ${inputs.optionPeriodMonths === m ? 'active' : ''}`}
                    onClick={() => update({ optionPeriodMonths: m })}>{m}mo period</button>
                ))}
              </div>
            )}
          </div>

          {/* Publishing */}
          <div className="calc-panel-ctrl">
            <div className="calc-panel-ctrl-head">
              <span>Publishing</span>
              {deal && deal.publishingValue > 0 && <span className="calc-panel-ctrl-value">{fmt(deal.publishingValue)}</span>}
            </div>
            <div className="calc-panel-toggles">
              {([
                { val: 'none' as const, label: 'None' },
                { val: 'admin25' as const, label: '25% Admin' },
                { val: 'copub50' as const, label: '50% Co-Pub' },
              ]).map(opt => (
                <button key={opt.val} className={`calc-panel-toggle ${inputs.publishing === opt.val ? 'active' : ''}`}
                  onClick={() => update({ publishing: opt.val })}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Content Budget */}
          <div className="calc-panel-ctrl">
            <div className="calc-panel-ctrl-head">
              <span>Content Budget</span>
              <span className="calc-panel-ctrl-value">{inputs.contentBudgetPct}%</span>
            </div>
            <div className="calc-panel-slider-wrap">
              <input type="range" min={0} max={50} value={inputs.contentBudgetPct}
                onChange={e => update({ contentBudgetPct: +e.target.value })} />
            </div>
          </div>

          {/* Toggles */}
          <div className="calc-panel-ctrl calc-panel-ctrl-checks">
            <label className="calc-panel-check">
              <input type="checkbox" checked={inputs.rightOfFirstRefusal}
                onChange={e => update({ rightOfFirstRefusal: e.target.checked })} />
              <span>Right of First Refusal <em>(+3%)</em></span>
            </label>
            <label className="calc-panel-check">
              <input type="checkbox" checked={inputs.upstreaming}
                onChange={e => update({ upstreaming: e.target.checked })} />
              <span>Upstreaming <em>(+7%)</em></span>
            </label>
            <label className="calc-panel-check">
              <input type="checkbox" checked={inputs.ancillaries}
                onChange={e => update({ ancillaries: e.target.checked })} />
              <span>Ancillaries <em>(+3.5%)</em></span>
            </label>
            <label className="calc-panel-check">
              <input type="checkbox" checked={inputs.allUpfront}
                onChange={e => update({ allUpfront: e.target.checked })} />
              <span>All Upfront <em>(−15%)</em></span>
            </label>
          </div>
        </div>

        {/* ── RIGHT: Deal Breakdown ── */}
        {deal && (
          <div className="calc-panel-breakdown">
            <h3 className="calc-panel-section-title">Deal Breakdown</h3>

            {/* Core Values */}
            <div className="calc-panel-section">
              <h4>Core Deal</h4>
              <div className="calc-panel-row"><span>Back Catalog</span><span>{fmt(deal.backCatalogValue)}</span></div>
              <div className="calc-panel-row"><span>Front Catalog</span><span>{fmt(deal.frontCatalogValue)}</span></div>
              <div className="calc-panel-row calc-panel-row-sub"><span>Base Offer</span><span>{fmt(deal.baseOfferValue)}</span></div>
            </div>

            {/* Modifiers */}
            <div className="calc-panel-section">
              <h4>Modifiers</h4>
              <div className="calc-panel-row"><span>Exclusivity ({inputs.exclusivityMonths}mo) ×{deal.exclusivityMultiplier.toFixed(2)}</span><span>{fmt(deal.postExclusivityValue)}</span></div>
              <div className="calc-panel-row"><span>Royalty ({inputs.artistRoyaltyPct}%) ×{deal.royaltyMultiplier.toFixed(2)}</span><span>{fmt(deal.postRoyaltyValue)}</span></div>
              {deal.rofrBonus > 0 && <div className="calc-panel-row"><span>ROFR Bonus</span><span>+{fmt(deal.rofrBonus)}</span></div>}
              <div className="calc-panel-row calc-panel-row-sub"><span>Core Deal Value</span><span>{fmt(deal.coreDealValue)}</span></div>
            </div>

            {/* Budget Split */}
            <div className="calc-panel-section">
              <h4>Budget Split (75 / 25)</h4>
              <div className="calc-panel-row"><span>Advance</span><span>{fmt(deal.advanceBudget)}</span></div>
              <div className="calc-panel-row"><span>Marketing</span><span>{fmt(deal.marketingBudget)}</span></div>
              {deal.contentBudget > 0 && (
                <>
                  <div className="calc-panel-row"><span>Content Budget (+10% bonus)</span><span>{fmt(deal.contentBudget)}</span></div>
                  <div className="calc-panel-row"><span>Adjusted Advance</span><span>{fmt(deal.adjustedAdvance)}</span></div>
                </>
              )}
            </div>

            {/* Payment Schedule */}
            <div className="calc-panel-section">
              <h4>Payment Schedule</h4>
              <div className="calc-panel-row"><span>Signing (25%)</span><span>{fmt(deal.signingPayment)}</span></div>
              <div className="calc-panel-row"><span>Back Delivery (25%)</span><span>{fmt(deal.backCatalogDeliveryPayment)}</span></div>
              {!inputs.allUpfront && (
                <>
                  <div className="calc-panel-row"><span>½ New Songs</span><span>{fmt(deal.halfSongsPayment)}</span></div>
                  <div className="calc-panel-row"><span>Other ½ Songs</span><span>{fmt(deal.otherHalfPayment)}</span></div>
                </>
              )}
              {deal.allUpfrontDiscount > 0 && (
                <div className="calc-panel-row calc-panel-row-negative"><span>All-Upfront Discount</span><span>−{fmt(deal.allUpfrontDiscount)}</span></div>
              )}
            </div>

            {/* Extras */}
            {(deal.totalOptionsValue > 0 || deal.publishingValue > 0 || deal.upstreamingValue > 0 || deal.ancillariesValue > 0) && (
              <div className="calc-panel-section">
                <h4>Additional Value</h4>
                {deal.totalOptionsValue > 0 && (
                  <div className="calc-panel-row"><span>{inputs.optionCount} Options ({inputs.optionPeriodMonths}mo)</span><span>+{fmt(deal.totalOptionsValue)}</span></div>
                )}
                {deal.publishingValue > 0 && (
                  <div className="calc-panel-row"><span>Publishing ({inputs.publishing === 'admin25' ? '25% Admin' : '50% Co-Pub'})</span><span>+{fmt(deal.publishingValue)}</span></div>
                )}
                {deal.upstreamingValue > 0 && (
                  <div className="calc-panel-row"><span>Upstreaming (7%)</span><span>+{fmt(deal.upstreamingValue)}</span></div>
                )}
                {deal.ancillariesValue > 0 && (
                  <div className="calc-panel-row"><span>Ancillaries (3.5%)</span><span>+{fmt(deal.ancillariesValue)}</span></div>
                )}
              </div>
            )}

            {/* Grand Total */}
            <div className="calc-panel-total">
              <span>Grand Total</span>
              <span>{fmt(deal.totalDealValue)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
