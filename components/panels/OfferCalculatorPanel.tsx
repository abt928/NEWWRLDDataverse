'use client';

import { useState, useMemo, useCallback } from 'react';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import type { DistroKidDataset } from '@/lib/types';
import { calculateDeal, DEFAULT_INPUTS, DEFAULT_OVERRIDES, type DealInputs, type DealOutput, type FormulaOverrides, type SongData, type MonthlyData } from '@/lib/deal-engine';

interface OfferCalculatorPanelProps {
  distrokid?: DistroKidDataset;
  artistId?: string;
}

const UNLOCKABLE_FIELDS = [
  { key: 'backCatalogCount', label: 'Back Catalog' },
  { key: 'frontCatalogCount', label: 'Front Catalog' },
  { key: 'exclusivityMonths', label: 'Exclusivity' },
  { key: 'artistRoyaltyPct', label: 'Artist Royalty' },
  { key: 'optionCount', label: 'Options' },
  { key: 'optionPeriodMonths', label: 'Option Period' },
  { key: 'publishing', label: 'Publishing' },
  { key: 'contentBudgetPct', label: 'Content Budget' },
  { key: 'rightOfFirstRefusal', label: 'ROFR' },
  { key: 'upstreaming', label: 'Upstreaming' },
  { key: 'ancillaries', label: 'Ancillaries' },
  { key: 'allUpfront', label: 'All Upfront' },
];

const FORMULA_FIELDS: { key: keyof FormulaOverrides; label: string; group: string; pct?: boolean; step?: number }[] = [
  { key: 'exclusivity3mo', label: '3 months', group: 'Exclusivity Multipliers', step: 0.01 },
  { key: 'exclusivity6mo', label: '6 months', group: 'Exclusivity Multipliers', step: 0.01 },
  { key: 'exclusivity12mo', label: '12 months', group: 'Exclusivity Multipliers', step: 0.01 },
  { key: 'exclusivity18mo', label: '18 months', group: 'Exclusivity Multipliers', step: 0.01 },
  { key: 'exclusivity24mo', label: '24 months', group: 'Exclusivity Multipliers', step: 0.01 },
  { key: 'royaltyDecreasePerTen', label: 'Decrease per 10% below 50', group: 'Royalty Formula', pct: true, step: 0.01 },
  { key: 'royaltyIncreasePer1', label: 'Increase per 1% above 50', group: 'Royalty Formula', step: 0.0005 },
  { key: 'rofrPct', label: 'ROFR Bonus', group: 'Deal Bonuses', pct: true, step: 0.005 },
  { key: 'upstreamingPct', label: 'Upstreaming', group: 'Deal Bonuses', pct: true, step: 0.005 },
  { key: 'ancillariesPct', label: 'Ancillaries', group: 'Deal Bonuses', pct: true, step: 0.005 },
  { key: 'advanceSplitPct', label: 'Advance Split', group: 'Budget Split', pct: true, step: 0.05 },
  { key: 'contentBonusPct', label: 'Content Budget Bonus', group: 'Budget Split', pct: true, step: 0.01 },
  { key: 'allUpfrontDiscountPct', label: 'All-Upfront Discount', group: 'Budget Split', pct: true, step: 0.01 },
  { key: 'optionPeriod8mo', label: '8 months', group: 'Option Period Multipliers', step: 0.01 },
  { key: 'optionPeriod12mo', label: '12 months', group: 'Option Period Multipliers', step: 0.01 },
  { key: 'optionPeriod16mo', label: '16 months', group: 'Option Period Multipliers', step: 0.01 },
  { key: 'publishingAdminPct', label: 'Admin Rate', group: 'Publishing', pct: true, step: 0.01 },
  { key: 'publishingCopubMultiplier', label: 'Co-Pub Multiplier', group: 'Publishing', step: 0.1 },
  { key: 'bigSongBonusPerSong', label: 'Per-Song Bonus', group: 'Big Song Bonus', pct: true, step: 0.005 },
  { key: 'bigSongBonusMax', label: 'Max Bonus Cap', group: 'Big Song Bonus', pct: true, step: 0.01 },
  { key: 'frontDiminishPerSong', label: 'Per-Song Reduction', group: 'Front Catalog Diminishing', pct: true, step: 0.005 },
  { key: 'frontDiminishFloor', label: 'Minimum Floor', group: 'Front Catalog Diminishing', pct: true, step: 0.05 },
  { key: 'frontDiminishAfter', label: 'Start After Song #', group: 'Front Catalog Diminishing', step: 1 },
];

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

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function OfferCalculatorPanel({ distrokid, artistId }: OfferCalculatorPanelProps) {
  const [inputs, setInputs] = useState<DealInputs>(DEFAULT_INPUTS);
  const [showSettings, setShowSettings] = useState(false);
  const [decayRate, setDecayRate] = useState(10);
  const [overrides, setOverrides] = useState<FormulaOverrides>({ ...DEFAULT_OVERRIDES });
  // Share flow state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareStep, setShareStep] = useState<1 | 2>(1);
  const [shareLabel, setShareLabel] = useState('');
  const [shareExpiry, setShareExpiry] = useState(30);
  const [shareUnlocked, setShareUnlocked] = useState<Set<string>>(new Set(['backCatalogCount', 'frontCatalogCount', 'exclusivityMonths']));
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCreating, setShareCreating] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareBranding, setShareBranding] = useState<'NEWWRLD' | 'ANTIGRAVITY'>('NEWWRLD');
  const [shareOgHeadline, setShareOgHeadline] = useState('');
  const [shareOgDescription, setShareOgDescription] = useState('');

  const songData: SongData[] = useMemo(() => {
    if (!distrokid?.songEarnings) return [];
    return distrokid.songEarnings.map((s: { title: string; earnings: number; streams: number }) => ({
      title: s.title, earnings: s.earnings || 0, streams: s.streams || 0,
    })).sort((a: SongData, b: SongData) => b.earnings - a.earnings);
  }, [distrokid]);

  const monthlyData: MonthlyData[] = useMemo(() => {
    if (!distrokid?.monthlyRevenue) return [];
    return distrokid.monthlyRevenue.map((m: { month: string; earnings: number; streams: number }) => ({
      month: m.month, earnings: m.earnings, streams: m.streams || 0,
    })).sort((a: MonthlyData, b: MonthlyData) => a.month.localeCompare(b.month));
  }, [distrokid]);

  const deal: DealOutput | null = useMemo(() => {
    if (songData.length === 0) return null;
    return calculateDeal(songData, monthlyData, inputs, overrides);
  }, [songData, monthlyData, inputs, overrides]);

  const updateOverride = (key: keyof FormulaOverrides, val: number) =>
    setOverrides(prev => ({ ...prev, [key]: val }));

  const update = (patch: Partial<DealInputs>) =>
    setInputs(prev => ({ ...prev, ...patch }));

  // ── Acquisition Modeling ──
  const acquisitionCost = deal?.totalDealValue ?? 0;
  const cpm = deal?.cpm ?? 3;
  const annualStreams = deal ? (deal.annualRevenue / cpm) * 1000 : 0;

  const fanChartData = useMemo(() => {
    const data: { label: string; historical?: number; optimistic?: number; base?: number; pessimistic?: number; severe?: number; isProjected: boolean }[] = [];
    // Historical from DK monthly
    const hist = [...monthlyData].sort((a, b) => a.month.localeCompare(b.month)).slice(-18);
    for (const m of hist) {
      const [y, mo] = m.month.split('-');
      data.push({ label: `${MONTHS_SHORT[parseInt(mo, 10) - 1]} ${y.slice(2)}`, historical: m.streams, isProjected: false });
    }
    // Projected 24 months
    if (annualStreams > 0) {
      const now = new Date();
      let baseStreams = hist.length > 0 ? hist[hist.length - 1].streams : annualStreams / 12;
      const makeDecay = (pct: number) => Math.pow(1 - pct / 100, 1 / 12);
      let sOpt = baseStreams, sBase = baseStreams, sPess = baseStreams, sSevere = baseStreams;
      for (let mo = 1; mo <= 24; mo++) {
        sOpt *= makeDecay(Math.max(0, decayRate - 5));
        sBase *= makeDecay(decayRate);
        sPess *= makeDecay(decayRate + 10);
        sSevere *= makeDecay(decayRate + 20);
        const fd = new Date(now.getFullYear(), now.getMonth() + mo, 1);
        data.push({
          label: `${MONTHS_SHORT[fd.getMonth()]} ${String(fd.getFullYear()).slice(2)}`,
          optimistic: Math.round(sOpt), base: Math.round(sBase),
          pessimistic: Math.round(sPess), severe: Math.round(sSevere), isProjected: true,
        });
      }
    }
    return data;
  }, [monthlyData, annualStreams, decayRate]);

  const todayIndex = fanChartData.findIndex(d => d.isProjected);

  // ROI scenarios
  const scenarios = useMemo(() => {
    if (!deal || cpm <= 0 || annualStreams <= 0) return null;
    const cost = acquisitionCost;
    const run = (annualDecay: number, label: string) => {
      const md = Math.pow(1 - annualDecay / 100, 1 / 12);
      let cum = 0, streams = annualStreams / 12, beMonth = -1;
      const snaps: Record<number, number> = {};
      for (let mo = 1; mo <= 24; mo++) {
        cum += (streams / 1000) * cpm;
        if (cost > 0 && beMonth < 0 && cum >= cost) beMonth = mo;
        if ([6, 12, 18, 24].includes(mo)) snaps[mo] = Math.round(cum);
        streams *= md;
      }
      return { label, decay: annualDecay, snaps, beMonth, roi: cost > 0 ? Math.round(((cum - cost) / cost) * 100) : 0 };
    };
    return [
      run(Math.max(0, decayRate - 5), 'Optimistic'),
      run(decayRate, 'Base Case'),
      run(decayRate + 10, 'Pessimistic'),
      run(decayRate + 20, 'Severe'),
    ];
  }, [deal, cpm, annualStreams, acquisitionCost, decayRate]);

  const FanTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="cpm-chart-tooltip">
        <div className="cpm-chart-tooltip-label">{label}</div>
        {d?.historical != null && <div className="cpm-chart-tooltip-row"><span className="cpm-chart-tooltip-dot" data-type="streams" /><span>Streams: {d.historical.toLocaleString()}</span></div>}
        {d?.isProjected && <>
          <div className="cpm-chart-tooltip-row"><span className="cpm-chart-tooltip-dot" data-type="actual" /><span>Optimistic: {(d.optimistic||0).toLocaleString()}</span></div>
          <div className="cpm-chart-tooltip-row"><span className="cpm-chart-tooltip-dot" data-type="streams" /><span>Base: {(d.base||0).toLocaleString()}</span></div>
        </>}
      </div>
    );
  };

  if (!distrokid || songData.length === 0) {
    return (
      <div className="panel-empty-state">
        <div className="empty-state-icon" aria-hidden="true">—</div>
        <h3>No Revenue Data</h3>
        <p>Drop a <strong>DistroKid (.zip)</strong> file on the home page to unlock the offer calculator.</p>
        <a href="/" className="btn-primary calc-panel-empty-link">← Upload Files</a>
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
          <div className="calc-panel-section-title-row">
            <h3 className="calc-panel-section-title">Deal Parameters</h3>
            <button className={`calc-panel-settings-btn ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(!showSettings)}>
              ⚙ Settings
            </button>
          </div>

          {/* Settings Drawer — Full Formula Control */}
          {showSettings && (
            <div className="calc-panel-settings">
              <h4>Engine Settings</h4>
              <div className="calc-panel-ctrl">
                <div className="calc-panel-ctrl-head"><span>Annual Decay Rate</span><span className="calc-panel-ctrl-value">{decayRate}%</span></div>
                <div className="calc-panel-slider-wrap">
                  <input type="range" min={0} max={50} value={decayRate} title="Annual decay rate"
                    onChange={e => setDecayRate(+e.target.value)} />
                </div>
              </div>
              <div className="calc-panel-settings-divider" />
              <h4>Formula Overrides</h4>
              <div className="calc-panel-settings-info">Adjust any multiplier below. Changes update the deal and ROI chart in real-time.</div>
              {(() => {
                const groups: Record<string, typeof FORMULA_FIELDS> = {};
                FORMULA_FIELDS.forEach(f => { (groups[f.group] ??= []).push(f); });
                return Object.entries(groups).map(([group, fields]) => (
                  <div key={group} className="calc-panel-formula-group">
                    <h5 className="calc-panel-formula-group-title">{group}</h5>
                    {fields.map(f => (
                      <div key={f.key} className="calc-panel-formula-row">
                        <span className="calc-panel-formula-label">{f.label}</span>
                        <div className="calc-panel-formula-input">
                          <input type="number" step={f.step ?? 0.01} title={f.label}
                            value={overrides[f.key]}
                            onChange={e => updateOverride(f.key, +e.target.value)} />
                          {f.pct && <span className="calc-panel-formula-pct">({((overrides[f.key] as number) * 100).toFixed(1)}%)</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
              <button className="btn-secondary calc-panel-reset-btn" onClick={() => setOverrides({ ...DEFAULT_OVERRIDES })}>Reset to Defaults</button>
            </div>
          )}

          {/* Back Catalog */}
          <div className="calc-panel-ctrl">
            <div className="calc-panel-ctrl-head">
              <span>Back Catalog</span>
              {deal && <span className="calc-panel-ctrl-value">{fmt(deal.backCatalogValue)}</span>}
            </div>
            <div className="calc-panel-slider-wrap">
              <label>{inputs.backCatalogCount} of {deal?.songsInCatalog ?? songData.length} songs</label>
              <input type="range" min={0} max={deal?.songsInCatalog ?? songData.length} title="Back catalog songs"
                value={inputs.backCatalogCount} onChange={e => update({ backCatalogCount: +e.target.value })} />
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
              <input type="range" min={0} max={30} value={inputs.frontCatalogCount} title="Front catalog songs"
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
              <input type="range" min={20} max={85} value={inputs.artistRoyaltyPct} title="Artist royalty"
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
              <input type="range" min={0} max={50} value={inputs.contentBudgetPct} title="Content budget"
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

            <div className="calc-panel-section">
              <h4>Core Deal</h4>
              <div className="calc-panel-row"><span>Back Catalog</span><span>{fmt(deal.backCatalogValue)}</span></div>
              <div className="calc-panel-row"><span>Front Catalog</span><span>{fmt(deal.frontCatalogValue)}</span></div>
              <div className="calc-panel-row calc-panel-row-sub"><span>Base Offer</span><span>{fmt(deal.baseOfferValue)}</span></div>
            </div>

            <div className="calc-panel-section">
              <h4>Modifiers</h4>
              <div className="calc-panel-row"><span>Exclusivity ({inputs.exclusivityMonths}mo) ×{deal.exclusivityMultiplier.toFixed(2)}</span><span>{fmt(deal.postExclusivityValue)}</span></div>
              <div className="calc-panel-row"><span>Royalty ({inputs.artistRoyaltyPct}%) ×{deal.royaltyMultiplier.toFixed(2)}</span><span>{fmt(deal.postRoyaltyValue)}</span></div>
              {deal.rofrBonus > 0 && <div className="calc-panel-row"><span>ROFR Bonus</span><span>+{fmt(deal.rofrBonus)}</span></div>}
              <div className="calc-panel-row calc-panel-row-sub"><span>Core Deal Value</span><span>{fmt(deal.coreDealValue)}</span></div>
            </div>

            <div className="calc-panel-section">
              <h4>Budget Split (75 / 25)</h4>
              <div className="calc-panel-row"><span>Advance</span><span>{fmt(deal.advanceBudget)}</span></div>
              <div className="calc-panel-row"><span>Marketing</span><span>{fmt(deal.marketingBudget)}</span></div>
              {deal.contentBudget > 0 && <>
                <div className="calc-panel-row"><span>Content Budget (+10% bonus)</span><span>{fmt(deal.contentBudget)}</span></div>
                <div className="calc-panel-row"><span>Adjusted Advance</span><span>{fmt(deal.adjustedAdvance)}</span></div>
              </>}
            </div>

            <div className="calc-panel-section">
              <h4>Payment Schedule</h4>
              <div className="calc-panel-row"><span>Signing (25%)</span><span>{fmt(deal.signingPayment)}</span></div>
              <div className="calc-panel-row"><span>Back Delivery (25%)</span><span>{fmt(deal.backCatalogDeliveryPayment)}</span></div>
              {!inputs.allUpfront && <>
                <div className="calc-panel-row"><span>½ New Songs</span><span>{fmt(deal.halfSongsPayment)}</span></div>
                <div className="calc-panel-row"><span>Other ½ Songs</span><span>{fmt(deal.otherHalfPayment)}</span></div>
              </>}
              {deal.allUpfrontDiscount > 0 && (
                <div className="calc-panel-row calc-panel-row-negative"><span>All-Upfront Discount</span><span>−{fmt(deal.allUpfrontDiscount)}</span></div>
              )}
            </div>

            {(deal.totalOptionsValue > 0 || deal.publishingValue > 0 || deal.upstreamingValue > 0 || deal.ancillariesValue > 0) && (
              <div className="calc-panel-section">
                <h4>Additional Value</h4>
                {deal.totalOptionsValue > 0 && <div className="calc-panel-row"><span>{inputs.optionCount} Options ({inputs.optionPeriodMonths}mo)</span><span>+{fmt(deal.totalOptionsValue)}</span></div>}
                {deal.publishingValue > 0 && <div className="calc-panel-row"><span>Publishing</span><span>+{fmt(deal.publishingValue)}</span></div>}
                {deal.upstreamingValue > 0 && <div className="calc-panel-row"><span>Upstreaming (7%)</span><span>+{fmt(deal.upstreamingValue)}</span></div>}
                {deal.ancillariesValue > 0 && <div className="calc-panel-row"><span>Ancillaries (3.5%)</span><span>+{fmt(deal.ancillariesValue)}</span></div>}
              </div>
            )}

            <div className="calc-panel-total">
              <span>Grand Total</span>
              <span>{fmt(deal.totalDealValue)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Acquisition Modeling ── */}
      {deal && fanChartData.length > 0 && (
        <div className="calc-panel-acq">
          <div className="calc-panel-acq-header">
            <h3 className="calc-panel-section-title">Acquisition Modeling</h3>
            <span className="calc-panel-acq-badge">Acquisition Cost: {fmt(acquisitionCost)} • Decay: {decayRate}%/yr • CPM: ${cpm}</span>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={fanChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="calcHistGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="calcOptGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" tick={{ fill: '#5a5c72', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: '#5a5c72', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtNum(v)} width={55} />
              <Tooltip content={<FanTooltip />} />
              {todayIndex > 0 && <ReferenceLine x={fanChartData[todayIndex]?.label} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" label={{ value: 'Today', position: 'top', fill: '#8b8da3', fontSize: 10 }} />}
              <Area type="monotone" dataKey="historical" stroke="#818cf8" strokeWidth={2} fill="url(#calcHistGrad)" connectNulls={false} dot={false} />
              <Area type="monotone" dataKey="optimistic" stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 2" fill="url(#calcOptGrad)" connectNulls={false} dot={false} />
              <Area type="monotone" dataKey="base" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" fill="none" connectNulls={false} dot={false} />
              <Area type="monotone" dataKey="pessimistic" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" fill="none" connectNulls={false} dot={false} />
              <Area type="monotone" dataKey="severe" stroke="#f87171" strokeWidth={1} strokeDasharray="3 3" fill="none" connectNulls={false} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="fan-chart-legend">
            <span className="fan-legend-item"><span className="fan-legend-line" data-color="hist" />Historical</span>
            <span className="fan-legend-item"><span className="fan-legend-line" data-color="opt" />Optimistic</span>
            <span className="fan-legend-item"><span className="fan-legend-line" data-color="base" />Base</span>
            <span className="fan-legend-item"><span className="fan-legend-line" data-color="pess" />Pessimistic</span>
            <span className="fan-legend-item"><span className="fan-legend-line" data-color="severe" />Severe</span>
          </div>

          {/* ROI Table */}
          {scenarios && (
            <div className="calc-panel-roi">
              <h4>ROI Analysis — Acquisition: {fmt(acquisitionCost)}</h4>
              <table className="cpm-table">
                <thead>
                  <tr>
                    <th>Scenario</th><th>Decay</th><th>6 Mo</th><th>12 Mo</th><th>18 Mo</th><th>24 Mo</th><th>Break-Even</th><th>24M ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map(s => (
                    <tr key={s.label} className={s.label === 'Base Case' ? 'cpm-row-actual' : ''}>
                      <td className="cpm-month">{s.label}</td>
                      <td className="cpm-streams">{s.decay}%/yr</td>
                      <td className="cpm-amount">{fmt(s.snaps[6] || 0)}</td>
                      <td className="cpm-amount">{fmt(s.snaps[12] || 0)}</td>
                      <td className="cpm-amount">{fmt(s.snaps[18] || 0)}</td>
                      <td className="cpm-amount">{fmt(s.snaps[24] || 0)}</td>
                      <td className={s.beMonth > 0 ? 'cpm-cpm' : 'cpm-note'}>{s.beMonth > 0 ? `Month ${s.beMonth}` : '> 24mo'}</td>
                      <td className={s.roi > 0 ? 'cpm-amount' : 'cpm-note'}>{s.roi > 0 ? `+${s.roi}%` : `${s.roi}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scenarios[1].beMonth > 0 && (
                <div className="acq-verdict">
                  At <strong>{decayRate}%</strong> annual decay and <strong>{fmt(acquisitionCost)}</strong> acquisition cost, break-even occurs at <strong>Month {scenarios[1].beMonth}</strong> with a
                  <strong className={scenarios[1].roi > 50 ? ' text-emerald' : scenarios[1].roi > 0 ? ' text-amber' : ' text-red'}>
                    {' '}{scenarios[1].roi > 0 ? '+' : ''}{scenarios[1].roi}% ROI
                  </strong> over 24 months.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Share with Artist */}
      {artistId && deal && (
        <div className="calc-panel-share-row">
          <button className="btn-primary" onClick={() => { setShowShareModal(true); setShareStep(1); setShareUrl(null); }}>
            Share Calculator with Artist →
          </button>
        </div>
      )}

      {/* Share Modal — Multi-Step */}
      {showShareModal && deal && (
        <div className="share-deal-modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="share-deal-modal share-deal-modal-wide" onClick={e => e.stopPropagation()}>

            {/* Step 1: Review */}
            {shareStep === 1 && (
              <>
                <h3>Review Deal Configuration</h3>
                <p className="share-deal-modal-sub">Review the current deal parameters and formula settings before sharing.</p>

                <div className="share-deal-review-grid">
                  <div className="share-deal-review-col">
                    <h4>Deal Parameters</h4>
                    <div className="share-deal-review-row"><span>Back Catalog</span><span>{inputs.backCatalogCount} songs → {fmt(deal.backCatalogValue)}</span></div>
                    <div className="share-deal-review-row"><span>Front Catalog</span><span>{inputs.frontCatalogCount} songs → {fmt(deal.frontCatalogValue)}</span></div>
                    <div className="share-deal-review-row"><span>Exclusivity</span><span>{inputs.exclusivityMonths}mo (×{deal.exclusivityMultiplier.toFixed(2)})</span></div>
                    <div className="share-deal-review-row"><span>Artist Royalty</span><span>{inputs.artistRoyaltyPct}% (×{deal.royaltyMultiplier.toFixed(2)})</span></div>
                    <div className="share-deal-review-row"><span>Options</span><span>{inputs.optionCount} × {inputs.optionPeriodMonths}mo</span></div>
                    <div className="share-deal-review-row"><span>Publishing</span><span>{inputs.publishing === 'none' ? 'None' : inputs.publishing === 'admin25' ? '25% Admin' : '50% Co-Pub'}</span></div>
                    <div className="share-deal-review-row share-deal-review-total"><span>Total Deal Value</span><span>{fmt(deal.totalDealValue)}</span></div>
                  </div>

                  <div className="share-deal-review-col">
                    <h4>Formula Overrides</h4>
                    {(() => {
                      const changed = Object.entries(overrides).filter(
                        ([k, v]) => v !== DEFAULT_OVERRIDES[k as keyof FormulaOverrides]
                      );
                      if (changed.length === 0) return <div className="share-deal-review-info">Using default formulas</div>;
                      return changed.map(([k, v]) => (
                        <div key={k} className="share-deal-review-row">
                          <span>{FORMULA_FIELDS.find(f => f.key === k)?.label || k}</span>
                          <span>{typeof v === 'number' ? v : String(v)} <em className="share-deal-review-default">(default: {DEFAULT_OVERRIDES[k as keyof FormulaOverrides]})</em></span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                <div className="share-deal-actions">
                  <button className="btn-secondary" onClick={() => setShowShareModal(false)}>Cancel</button>
                  <button className="btn-primary" onClick={() => setShareStep(2)}>Continue →</button>
                </div>
              </>
            )}

            {/* Step 2: Configure */}
            {shareStep === 2 && (
              <>
                <h3>Configure Share Link</h3>
                <p className="share-deal-modal-sub">Choose what the artist can adjust and customize the link appearance.</p>

                <div className="share-deal-field">
                  <label htmlFor="share-label">Link Label</label>
                  <input id="share-label" type="text" value={shareLabel} onChange={e => setShareLabel(e.target.value)}
                    placeholder={`${distrokid?.artistName || 'Artist'} — Deal Calculator`} />
                </div>

                <div className="share-deal-field">
                  <label htmlFor="share-expiry">Expires In</label>
                  <select id="share-expiry" value={shareExpiry} onChange={e => setShareExpiry(+e.target.value)}>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={0}>Never</option>
                  </select>
                </div>

                {/* Branding */}
                <div className="share-deal-field">
                  <label>Branding</label>
                  <div className="share-deal-branding-row">
                    {(['NEWWRLD', 'ANTIGRAVITY'] as const).map(b => (
                      <button key={b} className={`share-deal-branding-btn ${shareBranding === b ? 'active' : ''}`}
                        onClick={() => setShareBranding(b)}>{b}</button>
                    ))}
                  </div>
                </div>

                {/* OG Metadata */}
                <div className="share-deal-field">
                  <label htmlFor="share-og-headline">OG Headline</label>
                  <input id="share-og-headline" type="text" value={shareOgHeadline} onChange={e => setShareOgHeadline(e.target.value)}
                    placeholder={`${distrokid?.artistName || 'Artist'} × ${shareBranding} — Customize Your Offer`} />
                </div>
                <div className="share-deal-field">
                  <label htmlFor="share-og-desc">OG Description</label>
                  <input id="share-og-desc" type="text" value={shareOgDescription} onChange={e => setShareOgDescription(e.target.value)}
                    placeholder={`Explore and customize your deal terms with ${shareBranding}`} />
                </div>

                {/* Unlock Grid */}
                <div className="share-deal-unlock-header">
                  <span className="share-deal-unlock-title">Artist Can Adjust:</span>
                  <button className="share-deal-select-all" onClick={() => {
                    if (shareUnlocked.size === UNLOCKABLE_FIELDS.length) {
                      setShareUnlocked(new Set());
                    } else {
                      setShareUnlocked(new Set(UNLOCKABLE_FIELDS.map(f => f.key)));
                    }
                  }}>{shareUnlocked.size === UNLOCKABLE_FIELDS.length ? 'Deselect All' : 'Select All'}</button>
                </div>
                <div className="share-deal-unlock-grid">
                  {UNLOCKABLE_FIELDS.map(f => (
                    <label key={f.key} className="share-deal-unlock-item">
                      <input type="checkbox" checked={shareUnlocked.has(f.key)}
                        onChange={e => {
                          setShareUnlocked(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(f.key) : next.delete(f.key);
                            return next;
                          });
                        }} />
                      {f.label}
                    </label>
                  ))}
                </div>

                {shareUrl && (
                  <div className="share-deal-result">
                    <span className="share-deal-result-url">{shareUrl}</span>
                    <button className="share-deal-copy-btn" onClick={async () => {
                      try { await navigator.clipboard.writeText(shareUrl); } catch {
                        const ta = document.createElement('textarea'); ta.value = shareUrl;
                        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                      }
                      setShareCopied(true); setTimeout(() => setShareCopied(false), 2000);
                    }}>{shareCopied ? '✓ Copied!' : 'Copy'}</button>
                  </div>
                )}

                <div className="share-deal-actions">
                  <button className="btn-secondary" onClick={() => setShareStep(1)}>← Back</button>
                  <button className="btn-primary" disabled={shareCreating} onClick={async () => {
                    setShareCreating(true);
                    try {
                      const res = await fetch('/api/deal-share', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          artistId,
                          dealConfig: inputs,
                          unlockedFields: [...shareUnlocked],
                          constraints: {},
                          formulaOverrides: overrides,
                          branding: shareBranding,
                          ogHeadline: shareOgHeadline || `${distrokid?.artistName || 'Artist'} × ${shareBranding} — Customize Your Offer`,
                          ogDescription: shareOgDescription || `Explore and customize your deal terms with ${shareBranding}`,
                          label: shareLabel || `${distrokid?.artistName || 'Artist'} — Deal Calculator`,
                          expiresInDays: shareExpiry || null,
                        }),
                      });
                      if (res.ok) {
                        const result = await res.json();
                        setShareUrl(result.url);
                      }
                    } catch (err) {
                      console.error('Failed to create share link:', err);
                    }
                    setShareCreating(false);
                  }}>{shareCreating ? 'Creating…' : shareUrl ? 'Generate New Link' : 'Generate Link'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

