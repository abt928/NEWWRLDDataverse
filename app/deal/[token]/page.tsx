'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { calculateDeal, DEFAULT_INPUTS, type DealInputs, type DealOutput, type FormulaOverrides, type SongData, type MonthlyData } from '@/lib/deal-engine';

interface DealShareData {
  artistName: string;
  genre: string;
  label: string;
  branding: string;
  dealConfig: DealInputs;
  dealOutput: DealOutput;
  unlockedFields: string[];
  constraints: Record<string, { min?: number; max?: number }>;
  formulaOverrides: Partial<FormulaOverrides>;
  songData: SongData[];
  monthlyData: MonthlyData[];
  createdAt: string;
}

const TOOLTIPS: Record<string, string> = {
  backCatalogCount: 'Include more of your catalog to unlock higher deal value. Your most popular songs add bonus value to the offer.',
  frontCatalogCount: 'Commit to delivering new music to demonstrate ongoing creative output and increase the total deal.',
  exclusivityMonths: 'Longer exclusivity periods signal commitment and unlock premium deal terms with stronger marketing support.',
  artistRoyaltyPct: 'A balanced royalty rate ensures strong marketing investment in your catalog while maintaining your earnings.',
  optionCount: 'Options extend the partnership with additional terms. More options show long-term commitment and increase total value.',
  optionPeriodMonths: 'Longer option periods provide more time for catalog growth and unlock better deal terms.',
  publishing: 'Including publishing rights significantly increases the total deal value and enables broader licensing opportunities.',
  contentBudgetPct: 'Allocating budget to content creation increases the total deal by 10% of the shifted amount — a built-in bonus.',
  rightOfFirstRefusal: 'Granting first refusal rights adds a bonus to the deal and maintains a strong ongoing relationship.',
  upstreaming: 'Upstreaming unlocks major label distribution channels, adding significant value to your catalog.',
  ancillaries: 'Including ancillary rights (merch, sync, brand) adds additional revenue streams to the deal.',
  allUpfront: 'All-upfront payment simplifies the deal structure with a single signing payment.',
};

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

function HelpTip({ field }: { field: string }) {
  const [show, setShow] = useState(false);
  const tip = TOOLTIPS[field];
  if (!tip) return null;
  return (
    <span className="deal-share-help" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      ?
      {show && <span className="deal-share-help-tip">{tip}</span>}
    </span>
  );
}

export default function DealSharePage() {
  const params = useParams();
  const [data, setData] = useState<DealShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<DealInputs>(DEFAULT_INPUTS);

  useEffect(() => {
    async function fetchDeal() {
      try {
        const res = await fetch(`/api/deal-share/${params.token}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Link not found' }));
          setError(err.error || 'Failed to load deal');
          setLoading(false);
          return;
        }
        const dealData = await res.json();
        setData(dealData);
        setInputs({ ...DEFAULT_INPUTS, ...dealData.dealConfig });
      } catch {
        setError('Failed to connect');
      }
      setLoading(false);
    }
    if (params.token) fetchDeal();
  }, [params.token]);

  const isUnlocked = (field: string): boolean => {
    return data?.unlockedFields?.includes(field) || false;
  };

  const getConstraint = (field: string): { min?: number; max?: number } => {
    return data?.constraints?.[field] || {};
  };

  const update = (patch: Partial<DealInputs>) => {
    setInputs(prev => {
      const next = { ...prev, ...patch };
      for (const [key, value] of Object.entries(patch)) {
        const c = getConstraint(key);
        if (typeof value === 'number') {
          if (c.min !== undefined && value < c.min) (next as any)[key] = c.min;
          if (c.max !== undefined && value > c.max) (next as any)[key] = c.max;
        }
      }
      return next;
    });
  };

  const deal: DealOutput | null = useMemo(() => {
    if (!data?.songData?.length) return null;
    return calculateDeal(data.songData, data.monthlyData, inputs, data.formulaOverrides);
  }, [data, inputs]);

  const brand = data?.branding || 'NEWWRLD';

  if (loading) {
    return (
      <div className="deal-share-page">
        <div className="deal-share-loading"><div className="spinner" /><p>Loading deal…</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="deal-share-page">
        <div className="deal-share-error">
          <div className="deal-share-error-icon">✗</div>
          <h2>{error === 'This deal link has expired' ? 'Link Expired' : 'Link Not Found'}</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data || !deal) return null;

  return (
    <div className="deal-share-page">
      {/* Top Bar */}
      <div className="deal-share-topbar">
        <span className="deal-share-brand">{brand}</span>
        <span className="deal-share-topbar-label">DEAL CALCULATOR</span>
      </div>

      {/* Header */}
      <header className="deal-share-header">
        <div className="deal-share-header-info">
          <p className="deal-share-eyebrow">Customize Your Offer</p>
          <h1>{data.artistName}</h1>
          <div className="deal-share-collab">
            <span className="deal-share-collab-line" />
            <span className="deal-share-collab-text">× {brand}</span>
            <span className="deal-share-collab-line" />
          </div>
          {data.label && <p className="deal-share-subtitle">{data.label}</p>}
        </div>
      </header>

      {/* Hero KPIs */}
      <div className="deal-share-hero">
        <div className="deal-share-hero-primary">
          <span className="deal-share-hero-label">Total Deal Value</span>
          <span className="deal-share-hero-value">{fmt(deal.totalDealValue)}</span>
        </div>
        <div className="deal-share-hero-stats">
          <div className="deal-share-hero-stat">
            <span className="deal-share-hero-stat-val">{fmt(deal.annualRevenue)}</span>
            <span>Annual Revenue</span>
          </div>
          <div className="deal-share-hero-stat">
            <span className="deal-share-hero-stat-val">{fmtNum(deal.totalStreams)}</span>
            <span>Total Streams</span>
          </div>
          <div className="deal-share-hero-stat">
            <span className="deal-share-hero-stat-val">${deal.cpm}</span>
            <span>CPM</span>
          </div>
          <div className="deal-share-hero-stat">
            <span className="deal-share-hero-stat-val">{deal.songsInCatalog}</span>
            <span>Songs</span>
          </div>
        </div>
      </div>

      <div className="deal-share-grid">
        {/* Controls — ONLY show unlocked fields */}
        <div className="deal-share-controls">
          <h3>Your Deal Parameters</h3>

          {/* Back Catalog */}
          {isUnlocked('backCatalogCount') && (
            <div className="deal-share-ctrl">
              <div className="deal-share-ctrl-head">
                <span>Back Catalog <HelpTip field="backCatalogCount" /></span>
                <span className="deal-share-ctrl-val">{fmt(deal.backCatalogValue)}</span>
              </div>
              <div className="deal-share-slider">
                <label>{inputs.backCatalogCount} of {deal.songsInCatalog} songs</label>
                <input type="range" title="Back catalog songs" min={getConstraint('backCatalogCount').min ?? 0}
                  max={getConstraint('backCatalogCount').max ?? deal.songsInCatalog}
                  value={inputs.backCatalogCount}
                  onChange={e => update({ backCatalogCount: +e.target.value })} />
              </div>
            </div>
          )}

          {/* Front Catalog */}
          {isUnlocked('frontCatalogCount') && (
            <div className="deal-share-ctrl">
              <div className="deal-share-ctrl-head">
                <span>Front Catalog <HelpTip field="frontCatalogCount" /></span>
                <span className="deal-share-ctrl-val">{fmt(deal.frontCatalogValue)}</span>
              </div>
              <div className="deal-share-slider">
                <label>{inputs.frontCatalogCount} new songs</label>
                <input type="range" title="Front catalog songs" min={getConstraint('frontCatalogCount').min ?? 0}
                  max={getConstraint('frontCatalogCount').max ?? 30}
                  value={inputs.frontCatalogCount}
                  onChange={e => update({ frontCatalogCount: +e.target.value })} />
              </div>
            </div>
          )}

          {/* Exclusivity */}
          {isUnlocked('exclusivityMonths') && (
            <div className="deal-share-ctrl">
              <div className="deal-share-ctrl-head">
                <span>Exclusivity Period <HelpTip field="exclusivityMonths" /></span>
              </div>
              <div className="deal-share-toggles">
                {([3, 6, 12, 18, 24] as const).map(m => (
                  <button key={m} className={`deal-share-toggle ${inputs.exclusivityMonths === m ? 'active' : ''}`}
                    onClick={() => update({ exclusivityMonths: m })}>{m}mo</button>
                ))}
              </div>
            </div>
          )}

          {/* Artist Royalty */}
          {isUnlocked('artistRoyaltyPct') && (
            <div className="deal-share-ctrl">
              <div className="deal-share-ctrl-head">
                <span>Artist Royalty <HelpTip field="artistRoyaltyPct" /></span>
                <span className="deal-share-ctrl-val">{inputs.artistRoyaltyPct}%</span>
              </div>
              <div className="deal-share-slider">
                <input type="range" title="Artist royalty percentage" min={getConstraint('artistRoyaltyPct').min ?? 20}
                  max={getConstraint('artistRoyaltyPct').max ?? 85}
                  value={inputs.artistRoyaltyPct}
                  onChange={e => update({ artistRoyaltyPct: +e.target.value })} />
              </div>
            </div>
          )}

          {/* Options */}
          {isUnlocked('optionCount') && (
            <div className="deal-share-ctrl">
              <div className="deal-share-ctrl-head">
                <span>Options <HelpTip field="optionCount" /></span>
                {deal.totalOptionsValue > 0 && <span className="deal-share-ctrl-val">{fmt(deal.totalOptionsValue)}</span>}
              </div>
              <div className="deal-share-toggles">
                {([0, 1, 2, 3, 4] as const).map(n => (
                  <button key={n} className={`deal-share-toggle ${inputs.optionCount === n ? 'active' : ''}`}
                    onClick={() => update({ optionCount: n })}>{n}</button>
                ))}
              </div>
              {inputs.optionCount > 0 && isUnlocked('optionPeriodMonths') && (
                <div className="deal-share-toggles deal-share-sub">
                  {([8, 12, 16] as const).map(m => (
                    <button key={m} className={`deal-share-toggle ${inputs.optionPeriodMonths === m ? 'active' : ''}`}
                      onClick={() => update({ optionPeriodMonths: m })}>{m}mo period</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Publishing */}
          {isUnlocked('publishing') && (
            <div className="deal-share-ctrl">
              <div className="deal-share-ctrl-head">
                <span>Publishing <HelpTip field="publishing" /></span>
                {deal.publishingValue > 0 && <span className="deal-share-ctrl-val">{fmt(deal.publishingValue)}</span>}
              </div>
              <div className="deal-share-toggles">
                {([
                  { val: 'none' as const, label: 'None' },
                  { val: 'admin25' as const, label: '25% Admin' },
                  { val: 'copub50' as const, label: '50% Co-Pub' },
                ]).map(opt => (
                  <button key={opt.val} className={`deal-share-toggle ${inputs.publishing === opt.val ? 'active' : ''}`}
                    onClick={() => update({ publishing: opt.val })}>{opt.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Content Budget */}
          {isUnlocked('contentBudgetPct') && (
            <div className="deal-share-ctrl">
              <div className="deal-share-ctrl-head">
                <span>Content Budget <HelpTip field="contentBudgetPct" /></span>
                <span className="deal-share-ctrl-val">{inputs.contentBudgetPct}%</span>
              </div>
              <div className="deal-share-slider">
                <input type="range" title="Content budget percentage" min={getConstraint('contentBudgetPct').min ?? 0}
                  max={getConstraint('contentBudgetPct').max ?? 50}
                  value={inputs.contentBudgetPct}
                  onChange={e => update({ contentBudgetPct: +e.target.value })} />
              </div>
            </div>
          )}

          {/* Add-on checkboxes — only show if unlocked */}
          {(isUnlocked('rightOfFirstRefusal') || isUnlocked('upstreaming') || isUnlocked('ancillaries') || isUnlocked('allUpfront')) && (
            <div className="deal-share-ctrl">
              <div className="deal-share-ctrl-head"><span>Add-Ons</span></div>
              {isUnlocked('rightOfFirstRefusal') && (
                <label className="deal-share-check">
                  <input type="checkbox" checked={inputs.rightOfFirstRefusal}
                    onChange={e => update({ rightOfFirstRefusal: e.target.checked })} />
                  <span>Right of First Refusal <HelpTip field="rightOfFirstRefusal" /></span>
                </label>
              )}
              {isUnlocked('upstreaming') && (
                <label className="deal-share-check">
                  <input type="checkbox" checked={inputs.upstreaming}
                    onChange={e => update({ upstreaming: e.target.checked })} />
                  <span>Upstreaming <HelpTip field="upstreaming" /></span>
                </label>
              )}
              {isUnlocked('ancillaries') && (
                <label className="deal-share-check">
                  <input type="checkbox" checked={inputs.ancillaries}
                    onChange={e => update({ ancillaries: e.target.checked })} />
                  <span>Ancillaries <HelpTip field="ancillaries" /></span>
                </label>
              )}
              {isUnlocked('allUpfront') && (
                <label className="deal-share-check">
                  <input type="checkbox" checked={inputs.allUpfront}
                    onChange={e => update({ allUpfront: e.target.checked })} />
                  <span>All Upfront <HelpTip field="allUpfront" /></span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Deal Breakdown — no multipliers shown */}
        <div className="deal-share-breakdown">
          <h3>Deal Breakdown</h3>

          <div className="deal-share-section">
            <h4>Core Deal</h4>
            <div className="deal-share-row"><span>Back Catalog ({inputs.backCatalogCount} songs)</span><span>{fmt(deal.backCatalogValue)}</span></div>
            <div className="deal-share-row"><span>Front Catalog ({inputs.frontCatalogCount} songs)</span><span>{fmt(deal.frontCatalogValue)}</span></div>
            <div className="deal-share-row deal-share-row-sub"><span>Base Offer</span><span>{fmt(deal.baseOfferValue)}</span></div>
          </div>

          <div className="deal-share-section">
            <h4>Deal Adjustments</h4>
            <div className="deal-share-row"><span>Exclusivity ({inputs.exclusivityMonths}mo)</span><span>{fmt(deal.postExclusivityValue)}</span></div>
            <div className="deal-share-row"><span>Royalty ({inputs.artistRoyaltyPct}%)</span><span>{fmt(deal.postRoyaltyValue)}</span></div>
            {deal.rofrBonus > 0 && <div className="deal-share-row"><span>ROFR Bonus</span><span>+{fmt(deal.rofrBonus)}</span></div>}
            <div className="deal-share-row deal-share-row-sub"><span>Core Deal Value</span><span>{fmt(deal.coreDealValue)}</span></div>
          </div>

          <div className="deal-share-section">
            <h4>Budget Allocation</h4>
            <div className="deal-share-row"><span>Advance</span><span>{fmt(deal.advanceBudget)}</span></div>
            <div className="deal-share-row"><span>Marketing</span><span>{fmt(deal.marketingBudget)}</span></div>
            {deal.contentBudget > 0 && <>
              <div className="deal-share-row"><span>Content Budget (bonus included)</span><span>{fmt(deal.contentBudget)}</span></div>
              <div className="deal-share-row"><span>Adjusted Advance</span><span>{fmt(deal.adjustedAdvance)}</span></div>
            </>}
          </div>

          <div className="deal-share-section">
            <h4>Payment Schedule</h4>
            <div className="deal-share-row"><span>Signing</span><span>{fmt(deal.signingPayment)}</span></div>
            <div className="deal-share-row"><span>Back Delivery</span><span>{fmt(deal.backCatalogDeliveryPayment)}</span></div>
            {!inputs.allUpfront && <>
              <div className="deal-share-row"><span>½ New Songs</span><span>{fmt(deal.halfSongsPayment)}</span></div>
              <div className="deal-share-row"><span>Other ½ Songs</span><span>{fmt(deal.otherHalfPayment)}</span></div>
            </>}
            {deal.allUpfrontDiscount > 0 && (
              <div className="deal-share-row deal-share-row-neg"><span>All-Upfront Discount</span><span>−{fmt(deal.allUpfrontDiscount)}</span></div>
            )}
          </div>

          {(deal.totalOptionsValue > 0 || deal.publishingValue > 0 || deal.upstreamingValue > 0 || deal.ancillariesValue > 0) && (
            <div className="deal-share-section">
              <h4>Additional Value</h4>
              {deal.totalOptionsValue > 0 && <div className="deal-share-row"><span>{inputs.optionCount} Options ({inputs.optionPeriodMonths}mo)</span><span>+{fmt(deal.totalOptionsValue)}</span></div>}
              {deal.publishingValue > 0 && <div className="deal-share-row"><span>Publishing</span><span>+{fmt(deal.publishingValue)}</span></div>}
              {deal.upstreamingValue > 0 && <div className="deal-share-row"><span>Upstreaming</span><span>+{fmt(deal.upstreamingValue)}</span></div>}
              {deal.ancillariesValue > 0 && <div className="deal-share-row"><span>Ancillaries</span><span>+{fmt(deal.ancillariesValue)}</span></div>}
            </div>
          )}

          <div className="deal-share-total">
            <span>Grand Total</span>
            <span>{fmt(deal.totalDealValue)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="deal-share-footer">
        <div className="deal-share-footer-brand">{brand}</div>
        <p>This is an exploratory tool. Final terms are subject to negotiation and formal agreement.</p>
      </footer>
    </div>
  );
}
