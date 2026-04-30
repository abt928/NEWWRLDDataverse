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

const BRAND_FONTS: Record<string, string> = {
  NEWWRLD: 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap',
  ANTIGRAVITY: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
  SONGCASH: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700;800&display=swap',
};

const BRAND_NAV: Record<string, { items: { label: string; href: string }[]; cta: string; ctaHref: string }> = {
  SONGCASH: {
    items: [
      { label: 'HOW IT WORKS', href: 'https://www.songcash.com/#how-it-works' },
      { label: 'CALCULATOR', href: '#' },
      { label: 'ELIGIBILITY', href: 'https://www.songcash.com/#eligibility' },
      { label: 'FAQ', href: 'https://www.songcash.com/#faq' },
    ],
    cta: 'Get Your Offer', ctaHref: 'https://www.songcash.com/#get-offer',
  },
  NEWWRLD: {
    items: [
      { label: 'ABOUT', href: 'https://www.newwrld.io' },
      { label: 'ARTISTS', href: 'https://www.newwrld.io' },
      { label: 'CALCULATOR', href: '#' },
    ],
    cta: 'Get Started', ctaHref: 'https://www.newwrld.io',
  },
  ANTIGRAVITY: {
    items: [
      { label: 'SERVICES', href: 'https://antigravity.marketing' },
      { label: 'CALCULATOR', href: '#' },
      { label: 'CONTACT', href: 'https://antigravity.marketing' },
    ],
    cta: 'Get in Touch', ctaHref: 'https://antigravity.marketing',
  },
};

function BrandLogo({ brand }: { brand: string }) {
  if (brand === 'SONGCASH') {
    return <span className="ds-brand-logo"><span className="ds-brand-song">SONG</span><span className="ds-brand-cash">CASH</span></span>;
  }
  if (brand === 'ANTIGRAVITY') {
    return <span className="ds-brand-logo ds-brand-ag">Antigravity<span className="ds-brand-dot">.</span>marketing</span>;
  }
  return <span className="ds-brand-logo">{brand}</span>;
}

// Exclusivity multiplier labels
const EXCL_LABELS: Record<number, string> = { 3: '-45%', 6: '-30%', 12: '', 18: '+4%', 24: '+8%' };
const LICENSE_LABELS: Record<string, string> = { '6yr': '6 Years', '12yr': '12 Years', '20yr': '20 Years', 'perpetuity': 'Perpetuity' };

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

  const isUnlocked = (field: string): boolean => data?.unlockedFields?.includes(field) || false;

  const getConstraint = (field: string): { min?: number; max?: number } => data?.constraints?.[field] || {};

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
  const nav = BRAND_NAV[brand] || BRAND_NAV.NEWWRLD;

  if (loading) {
    return (
      <div className="ds-page">
        <div className="ds-loading"><div className="spinner" /><p>Loading deal…</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ds-page">
        <div className="ds-error">
          <div className="ds-error-icon">✗</div>
          <h2>{error === 'This deal link has expired' ? 'Link Expired' : 'Link Not Found'}</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data || !deal) return null;

  return (
    <div className="ds-page" data-brand={brand}>
      {/* Brand Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={BRAND_FONTS[brand] || BRAND_FONTS.NEWWRLD} />

      {/* ── Navigation Bar ── */}
      <nav className="ds-nav">
        <BrandLogo brand={brand} />
        <div className="ds-nav-links">
          {nav.items.map(item => (
            <a key={item.label} href={item.href} className="ds-nav-link">{item.label}</a>
          ))}
          <a href={nav.ctaHref} className="ds-nav-cta">{nav.cta}</a>
        </div>
      </nav>

      {/* ── Header ── */}
      <header className="ds-header">
        <div className="ds-header-left">
          <span className="ds-header-eyebrow">// DEAL CALCULATOR</span>
          <h1 className="ds-header-artist">{data.artistName}</h1>
        </div>
        <div className="ds-header-right">
          <span className="ds-header-deal-label">TOTAL DEAL VALUE</span>
          <span className="ds-header-deal-value">{fmt(deal.totalDealValue)}</span>
        </div>
      </header>

      {/* ── Stats Bar ── */}
      <div className="ds-stats-bar">
        <div className="ds-stat">
          <span className="ds-stat-val">{fmt(deal.annualRevenue)}</span>
          <span className="ds-stat-label">ANNUAL REVENUE</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-val">{fmtNum(deal.totalStreams)}</span>
          <span className="ds-stat-label">TOTAL STREAMS</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-val">${deal.cpm}</span>
          <span className="ds-stat-label">CPM</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-val">{deal.songsInCatalog}</span>
          <span className="ds-stat-label">SONGS</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-val">{deal.catalogMonths}mo</span>
          <span className="ds-stat-label">CATALOG SPAN</span>
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="ds-main">

        {/* Back Catalog + Front Catalog — side by side */}
        {(isUnlocked('backCatalogCount') || isUnlocked('frontCatalogCount')) && (
          <div className="ds-row-2">
            {isUnlocked('backCatalogCount') && (
              <section className="ds-card">
                <h3>Back Catalog</h3>
                <p className="ds-card-desc">Songs from your existing catalog. Valued at {inputs.backCatalogMonthMultiple}× monthly revenue.</p>
                <div className="ds-slider-row">
                  <span className="ds-slider-label">{inputs.backCatalogCount} of {deal.songsInCatalog} songs</span>
                  <input type="range" className="ds-range" min={getConstraint('backCatalogCount').min ?? 0}
                    max={getConstraint('backCatalogCount').max ?? deal.songsInCatalog}
                    value={inputs.backCatalogCount} title="Back catalog songs"
                    onChange={e => update({ backCatalogCount: +e.target.value })} />
                </div>
                {isUnlocked('backCatalogMonthMultiple') && (
                  <div className="ds-slider-row">
                    <span className="ds-slider-label">Month Multiple: {inputs.backCatalogMonthMultiple}×</span>
                    <input type="range" className="ds-range" min={1} max={24} step={0.5}
                      value={inputs.backCatalogMonthMultiple} title="Month multiple"
                      onChange={e => update({ backCatalogMonthMultiple: +e.target.value })} />
                  </div>
                )}
                <span className="ds-card-value">{fmt(deal.backCatalogValue)}</span>
              </section>
            )}
            {isUnlocked('frontCatalogCount') && (
              <section className="ds-card">
                <h3>Front Catalog</h3>
                <p className="ds-card-desc">New songs to deliver. Base value: ${(inputs.frontCatalogBaseValue ?? deal.suggestedFrontBaseValue).toFixed(0)}/mo × {inputs.frontCatalogMonthMultiplier}mo.</p>
                <div className="ds-slider-row">
                  <span className="ds-slider-label">{inputs.frontCatalogCount} new songs</span>
                  <input type="range" className="ds-range" min={getConstraint('frontCatalogCount').min ?? 0}
                    max={getConstraint('frontCatalogCount').max ?? 30}
                    value={inputs.frontCatalogCount} title="Front catalog songs"
                    onChange={e => update({ frontCatalogCount: +e.target.value })} />
                </div>
                <span className="ds-card-value">{fmt(deal.frontCatalogValue)}</span>
              </section>
            )}
          </div>
        )}

        {/* Exclusivity + License Period — side by side */}
        {(isUnlocked('exclusivityMonths') || isUnlocked('licensePeriod')) && (
          <div className="ds-row-2">
            {isUnlocked('exclusivityMonths') && (
              <section className="ds-card">
                <h3>Exclusivity Period</h3>
                <div className="ds-toggles">
                  {([3, 6, 12, 18, 24] as const).map(m => (
                    <button key={m}
                      className={`ds-toggle ${inputs.exclusivityMonths === m ? 'active' : ''}`}
                      onClick={() => update({ exclusivityMonths: m })}>
                      {m}mo
                      {EXCL_LABELS[m] && <span className={`ds-toggle-badge ${EXCL_LABELS[m].startsWith('+') ? 'positive' : 'negative'}`}>{EXCL_LABELS[m]}</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {isUnlocked('licensePeriod') && (
              <section className="ds-card">
                <h3>License Period</h3>
                <div className="ds-toggles">
                  {(['6yr', '12yr', '20yr', 'perpetuity'] as const).map(lp => (
                    <button key={lp}
                      className={`ds-toggle ${inputs.licensePeriod === lp ? 'active' : ''}`}
                      onClick={() => update({ licensePeriod: lp })}>
                      {LICENSE_LABELS[lp]}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Artist Royalty */}
        {isUnlocked('artistRoyaltyPct') && (
          <section className="ds-card ds-card-full">
            <h3>Artist Royalty</h3>
            <p className="ds-card-desc">{inputs.artistRoyaltyPct}% — Modifier: {deal.royaltyMultiplier > 1 ? '+' : ''}{((deal.royaltyMultiplier - 1) * 100).toFixed(1)}%</p>
            <div className="ds-slider-row">
              <span className="ds-slider-label">{inputs.artistRoyaltyPct}%</span>
              <input type="range" className="ds-range" min={getConstraint('artistRoyaltyPct').min ?? 20}
                max={getConstraint('artistRoyaltyPct').max ?? 85}
                value={inputs.artistRoyaltyPct} title="Artist royalty"
                onChange={e => update({ artistRoyaltyPct: +e.target.value })} />
            </div>
          </section>
        )}

        {/* Options */}
        {isUnlocked('optionCount') && (
          <section className="ds-card ds-card-full">
            <h3>Options</h3>
            <p className="ds-card-desc">Each option scales off {inputs.optionPct}% of front catalog value{inputs.optionDecayPct > 0 ? `, reducing ${inputs.optionDecayPct}% per additional option` : ''}</p>
            <div className="ds-toggles">
              {([0, 1, 2, 3, 4] as const).map(n => (
                <button key={n}
                  className={`ds-toggle ${inputs.optionCount === n ? 'active' : ''}`}
                  onClick={() => update({ optionCount: n })}>{n}</button>
              ))}
            </div>
            {deal.optionBreakdown.length > 0 && (
              <div className="ds-payment-rows" style={{ marginTop: '0.75rem' }}>
                {deal.optionBreakdown.map((val, i) => (
                  <div key={i} className="ds-payment-row">
                    <span>Option {i + 1}</span>
                    <span className="ds-payment-val">{fmt(val)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Publishing */}
        {isUnlocked('publishing') && (
          <section className="ds-card ds-card-full">
            <h3>Publishing</h3>
            <div className="ds-toggles">
              {([
                { val: 'none' as const, label: 'None' },
                { val: 'admin25' as const, label: '25% Admin' },
                { val: 'copub50' as const, label: '50% Co-Pub' },
              ]).map(opt => (
                <button key={opt.val}
                  className={`ds-toggle ${inputs.publishing === opt.val ? 'active' : ''}`}
                  onClick={() => update({ publishing: opt.val })}>{opt.label}</button>
              ))}
            </div>
          </section>
        )}

        {/* Content Budget Shift */}
        {isUnlocked('contentBudgetPct') && (
          <section className="ds-card ds-card-full">
            <h3>Content Budget Shift</h3>
            <p className="ds-card-desc">Allocate a portion of the deal to content creation.</p>
            <div className="ds-slider-row">
              <span className="ds-slider-label">{inputs.contentBudgetPct}% ({fmt(deal.contentBudget)})</span>
              <input type="range" className="ds-range" min={getConstraint('contentBudgetPct').min ?? 0}
                max={getConstraint('contentBudgetPct').max ?? 50}
                value={inputs.contentBudgetPct} title="Content budget"
                onChange={e => update({ contentBudgetPct: +e.target.value })} />
            </div>
          </section>
        )}

        {/* Marketing Budget */}
        {isUnlocked('marketingBudgetPct') && (
          <section className="ds-card ds-card-full">
            <h3>Marketing Budget</h3>
            <p className="ds-card-desc">Portion of total deal allocated to marketing.</p>
            <div className="ds-slider-row">
              <span className="ds-slider-label">{inputs.marketingBudgetPct}% ({fmt(deal.marketingBudgetValue)})</span>
              <input type="range" className="ds-range" min={getConstraint('marketingBudgetPct').min ?? 5}
                max={getConstraint('marketingBudgetPct').max ?? 30}
                value={inputs.marketingBudgetPct} title="Marketing budget"
                onChange={e => update({ marketingBudgetPct: +e.target.value })} />
            </div>
          </section>
        )}

        {/* Goodwill Bonus */}
        {deal.goodwillValue > 0 && (
          <section className="ds-card ds-card-full ds-card-bonus">
            <h3>✦ Partnership Bonus</h3>
            <div className="ds-payment-rows">
              <div className="ds-payment-row">
                <span>Goodwill Bonus (+{inputs.goodwillBonusPct}%)</span>
                <span className="ds-payment-val ds-payment-val-bonus">+{fmt(deal.goodwillValue)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Deal Add-Ons (ROFR, Upstreaming, Ancillaries) */}
        {(deal.rofrBonus > 0 || deal.upstreamingValue > 0 || deal.ancillariesValue > 0) && (
          <section className="ds-card ds-card-full">
            <h3>Deal Add-Ons</h3>
            <div className="ds-payment-rows">
              {deal.rofrBonus > 0 && (
                <div className="ds-payment-row">
                  <span>Right of First Refusal</span>
                  <span className="ds-payment-val">+{fmt(deal.rofrBonus)}</span>
                </div>
              )}
              {deal.upstreamingValue > 0 && (
                <div className="ds-payment-row">
                  <span>Upstreaming</span>
                  <span className="ds-payment-val">+{fmt(deal.upstreamingValue)}</span>
                </div>
              )}
              {deal.ancillariesValue > 0 && (
                <div className="ds-payment-row">
                  <span>Ancillaries</span>
                  <span className="ds-payment-val">+{fmt(deal.ancillariesValue)}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* All Upfront Discount */}
        {deal.allUpfrontDiscount > 0 && (
          <section className="ds-card ds-card-full">
            <h3>All Upfront Discount</h3>
            <div className="ds-payment-rows">
              <div className="ds-payment-row ds-payment-row-neg">
                <span>All Upfront</span>
                <span className="ds-payment-val">−{fmt(deal.allUpfrontDiscount)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Payment Schedule */}
        <section className="ds-card ds-card-full">
          <h3>Payment Schedule</h3>
          <div className="ds-payment-rows">
            {inputs.allUpfront ? (
              <div className="ds-payment-row">
                <span>Full Payment (Signing)</span>
                <span className="ds-payment-val">{fmt(deal.signingPayment)}</span>
              </div>
            ) : (
              <>
                <div className="ds-payment-row">
                  <span>Signing</span>
                  <span className="ds-payment-val">{fmt(deal.signingPayment)}</span>
                </div>
                <div className="ds-payment-row">
                  <span>Back Catalog Delivery</span>
                  <span className="ds-payment-val">{fmt(deal.backCatalogDeliveryPayment)}</span>
                </div>
                <div className="ds-payment-row">
                  <span>½ New Songs</span>
                  <span className="ds-payment-val">{fmt(deal.halfSongsPayment)}</span>
                </div>
                <div className="ds-payment-row">
                  <span>Other ½</span>
                  <span className="ds-payment-val">{fmt(deal.otherHalfPayment)}</span>
                </div>
              </>
            )}
          </div>
        </section>

      </main>

      {/* ── Sticky Footer Bar ── */}
      <div className="ds-sticky-bar">
        <div className="ds-sticky-inner">
          <span className="ds-sticky-core">Base Deal: {fmt(deal.baseOfferValue)}</span>
          <div className="ds-sticky-total">
            <span className="ds-sticky-total-label">TOTAL DEAL VALUE</span>
            <span className="ds-sticky-total-value">{fmt(deal.totalDealValue)}</span>
          </div>
          <a href={BRAND_NAV[brand]?.ctaHref || '#'} className="ds-sticky-cta">GET YOUR OFFICIAL OFFER →</a>
        </div>
      </div>

      {/* Footer spacer for sticky bar */}
      <div className="ds-footer-spacer" />
    </div>
  );
}
