'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { calculateDeal, DEFAULT_INPUTS, type DealInputs, type DealOutput, type SongData, type MonthlyData } from '@/lib/deal-engine';

interface LeadData {
  id: string;
  name: string;
  email: string;
  phone: string;
  spotifyUrl: string;
  dealConfig: DealInputs;
  dealOutput: DealOutput;
  status: string;
  notes: string;
  createdAt: string;
  artist: {
    id: string;
    name: string;
    distrokidData: Array<{
      title: string;
      earnings: number;
      quantity: number;
      saleMonth: string;
    }>;
  };
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

export default function OfferReviewPage() {
  const params = useParams();
  const router = useRouter();
  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [internalInputs, setInternalInputs] = useState<DealInputs>(DEFAULT_INPUTS);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchLead() {
      try {
        // Find the latest lead for this artist
        const res = await fetch('/api/songcash/leads');
        if (!res.ok) throw new Error('Failed to fetch leads');
        const leads = await res.json();
        const artistLead = leads.find((l: any) => l.artistId === params.id);
        if (artistLead) {
          // Fetch full lead details
          const detailRes = await fetch(`/api/songcash/leads/${artistLead.id}`);
          if (detailRes.ok) {
            const data = await detailRes.json();
            setLead(data);
            setNotes(data.notes || '');
            // Initialize internal inputs from the artist's deal config
            if (data.dealConfig && typeof data.dealConfig === 'object') {
              setInternalInputs({ ...DEFAULT_INPUTS, ...data.dealConfig });
            }
          }
        }
      } catch (err) {
        console.error('Failed to load lead:', err);
      }
      setLoading(false);
    }
    fetchLead();
  }, [params.id]);

  // Reconstruct song earnings from DK data for the deal engine
  const songEarnings: SongData[] = useMemo(() => {
    if (!lead?.artist?.distrokidData) return [];
    const songMap = new Map<string, { title: string; totalEarnings: number; totalStreams: number }>();
    for (const entry of lead.artist.distrokidData) {
      const key = entry.title;
      const existing = songMap.get(key) || { title: key, totalEarnings: 0, totalStreams: 0 };
      existing.totalEarnings += entry.earnings || 0;
      existing.totalStreams += entry.quantity || 0;
      songMap.set(key, existing);
    }
    return Array.from(songMap.values())
      .map(s => ({ title: s.title, earnings: s.totalEarnings, streams: s.totalStreams }))
      .sort((a, b) => b.earnings - a.earnings);
  }, [lead]);

  const monthlyRevenue: MonthlyData[] = useMemo(() => {
    if (!lead?.artist?.distrokidData) return [];
    const map = new Map<string, { earnings: number; streams: number }>();
    for (const entry of lead.artist.distrokidData) {
      if (entry.saleMonth) {
        const existing = map.get(entry.saleMonth) || { earnings: 0, streams: 0 };
        existing.earnings += entry.earnings || 0;
        existing.streams += entry.quantity || 0;
        map.set(entry.saleMonth, existing);
      }
    }
    return Array.from(map.entries())
      .map(([month, data]) => ({ month, earnings: data.earnings, streams: data.streams }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [lead]);

  // Artist's original deal output
  const artistDeal = lead?.dealOutput as DealOutput | null;
  const artistInputs = lead?.dealConfig as DealInputs | null;

  // Internal (adjusted) deal output
  const internalDeal = useMemo(() => {
    if (songEarnings.length === 0) return null;
    return calculateDeal(songEarnings, monthlyRevenue, internalInputs);
  }, [songEarnings, monthlyRevenue, internalInputs]);

  const update = (patch: Partial<DealInputs>) =>
    setInternalInputs(prev => ({ ...prev, ...patch }));

  const saveDeal = useCallback(async () => {
    if (!lead || !internalDeal) return;
    setSaving(true);
    try {
      await fetch(`/api/songcash/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          dealConfig: internalInputs,
          dealOutput: internalDeal,
          status: 'reviewing',
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save:', err);
    }
    setSaving(false);
  }, [lead, notes, internalInputs, internalDeal]);

  const sendOffer = useCallback(async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await fetch(`/api/songcash/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'offered',
          notes,
          dealConfig: internalInputs,
          dealOutput: internalDeal,
        }),
      });
      router.push('/');
    } catch (err) {
      console.error('Failed to send offer:', err);
    }
    setSaving(false);
  }, [lead, notes, internalInputs, internalDeal, router]);

  if (loading) {
    return (
      <div className="offer-review-page">
        <div className="offer-loading"><div className="spinner" /><p>Loading offer details…</p></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="offer-review-page">
        <div className="offer-empty">
          <h2>No lead found</h2>
          <p>This artist doesn&apos;t have a Songcash submission yet.</p>
          <button className="btn-secondary" onClick={() => router.push('/')}>← Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const delta = artistDeal && internalDeal
    ? internalDeal.totalDealValue - artistDeal.totalDealValue
    : 0;

  return (
    <div className="offer-review-page">
      {/* ── Header ── */}
      <header className="offer-header">
        <button className="btn-secondary offer-back" onClick={() => router.push('/')}>
          ← Dashboard
        </button>
        <div className="offer-header-info">
          <h1>{lead.artist.name}</h1>
          <span className={`offer-status-badge status-${lead.status}`}>
            {lead.status.toUpperCase()}
          </span>
        </div>
        <div className="offer-header-actions">
          <button className="btn-secondary" onClick={saveDeal} disabled={saving}>
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="btn-primary" onClick={sendOffer} disabled={saving}>
            Send Offer →
          </button>
        </div>
      </header>

      {/* ── Contact Card ── */}
      <div className="offer-contact-card">
        <div className="offer-contact-item">
          <span className="offer-contact-label">Name</span>
          <span className="offer-contact-value">{lead.name}</span>
        </div>
        <div className="offer-contact-item">
          <span className="offer-contact-label">Email</span>
          <a href={`mailto:${lead.email}`} className="offer-contact-value offer-contact-link">{lead.email}</a>
        </div>
        {lead.phone && (
          <div className="offer-contact-item">
            <span className="offer-contact-label">Phone</span>
            <a href={`tel:${lead.phone}`} className="offer-contact-value offer-contact-link">{lead.phone}</a>
          </div>
        )}
        {lead.spotifyUrl && (
          <div className="offer-contact-item">
            <span className="offer-contact-label">Spotify</span>
            <a href={lead.spotifyUrl} target="_blank" rel="noopener noreferrer" className="offer-contact-value offer-contact-link">
              {lead.spotifyUrl.replace('https://open.spotify.com/artist/', '').slice(0, 22)}…
            </a>
          </div>
        )}
        <div className="offer-contact-item">
          <span className="offer-contact-label">Submitted</span>
          <span className="offer-contact-value">{new Date(lead.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* ── Side-by-Side Comparison ── */}
      <div className="offer-comparison">
        {/* LEFT: Artist's Original Selections */}
        <div className="offer-column offer-column-artist">
          <div className="offer-column-header">
            <h2>Artist&apos;s Selections</h2>
            <span className="offer-column-tag">READ-ONLY</span>
          </div>

          {artistDeal && artistInputs ? (
            <div className="offer-deal-summary">
              <div className="offer-total-bar">
                <span>Total Deal Value</span>
                <span className="offer-total-value">{fmt(artistDeal.totalDealValue)}</span>
              </div>

              <div className="offer-detail-grid">
                <div className="offer-detail">
                  <span className="offer-detail-label">Back Catalog</span>
                  <span>{artistInputs.backCatalogCount} songs → {fmt(artistDeal.backCatalogValue)}</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Front Catalog</span>
                  <span>{artistInputs.frontCatalogCount} songs → {fmt(artistDeal.frontCatalogValue)}</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Exclusivity</span>
                  <span>{artistInputs.exclusivityMonths}mo</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Artist Royalty</span>
                  <span>{artistInputs.artistRoyaltyPct}%</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Options</span>
                  <span>{artistInputs.optionCount} ({artistInputs.optionPct || 80}%, −{artistInputs.optionDecayPct || 10}%/opt) → {fmt(artistDeal.totalOptionsValue)}</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">License Period</span>
                  <span>{artistInputs.licensePeriod || 'perpetuity'}</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Publishing</span>
                  <span>{artistInputs.publishing === 'none' ? 'None' : artistInputs.publishing === 'admin25' ? '25% Admin' : '50% Co-Pub'} → {fmt(artistDeal.publishingValue)}</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Marketing Budget</span>
                  <span>{artistInputs.marketingBudgetPct || 10}% ({fmt(artistDeal.marketingBudgetValue)})</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Content Budget</span>
                  <span>{artistInputs.contentBudgetPct}%</span>
                </div>
                {artistDeal.goodwillValue > 0 && (
                  <div className="offer-detail">
                    <span className="offer-detail-label">Goodwill Bonus</span>
                    <span>+{artistInputs.goodwillBonusPct || 0}% ({fmt(artistDeal.goodwillValue)})</span>
                  </div>
                )}
                <div className="offer-detail">
                  <span className="offer-detail-label">ROFR</span>
                  <span>{artistInputs.rightOfFirstRefusal ? 'Yes' : 'No'}</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Upstreaming</span>
                  <span>{artistInputs.upstreaming ? 'Yes' : 'No'}</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">Ancillaries</span>
                  <span>{artistInputs.ancillaries ? 'Yes' : 'No'}</span>
                </div>
                <div className="offer-detail">
                  <span className="offer-detail-label">All Upfront</span>
                  <span>{artistInputs.allUpfront ? 'Yes' : 'No'}</span>
                </div>
              </div>

              <div className="offer-payment-schedule">
                <h4>Payment Schedule</h4>
                <div className="offer-sched-item"><span>Signing</span><span>{fmt(artistDeal.signingPayment)}</span></div>
                <div className="offer-sched-item"><span>Back Delivery</span><span>{fmt(artistDeal.backCatalogDeliveryPayment)}</span></div>
                {!artistInputs.allUpfront && (
                  <>
                    <div className="offer-sched-item"><span>½ New Songs</span><span>{fmt(artistDeal.halfSongsPayment)}</span></div>
                    <div className="offer-sched-item"><span>Other ½</span><span>{fmt(artistDeal.otherHalfPayment)}</span></div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="offer-no-data">No deal configuration submitted</p>
          )}
        </div>

        {/* RIGHT: Internal Adjustable Version */}
        <div className="offer-column offer-column-internal">
          <div className="offer-column-header">
            <h2>Your Adjusted Offer</h2>
            {delta !== 0 && (
              <span className={`offer-delta ${delta > 0 ? 'delta-up' : 'delta-down'}`}>
                {delta > 0 ? '+' : ''}{fmt(delta)}
              </span>
            )}
          </div>

          {internalDeal ? (
            <div className="offer-deal-interactive">
              <div className="offer-total-bar offer-total-bar-internal">
                <span>Your Offer Total</span>
                <span className="offer-total-value">{fmt(internalDeal.totalDealValue)}</span>
              </div>

              {/* Back Catalog */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header">
                  <span>Back Catalog</span>
                  <span>{fmt(internalDeal.backCatalogValue)}</span>
                </div>
                <div className="offer-ctrl-slider">
                  <label>{internalInputs.backCatalogCount} of {internalDeal.songsInCatalog} songs</label>
                  <input type="range" min={0} max={internalDeal.songsInCatalog} value={internalInputs.backCatalogCount}
                    aria-label="Back catalog songs" onChange={e => update({ backCatalogCount: +e.target.value })} />
                </div>
              </div>

              {/* Front Catalog */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header">
                  <span>Front Catalog</span>
                  <span>{fmt(internalDeal.frontCatalogValue)}</span>
                </div>
                <div className="offer-ctrl-slider">
                  <label>{internalInputs.frontCatalogCount} new songs</label>
                  <input type="range" min={0} max={30} value={internalInputs.frontCatalogCount}
                    aria-label="Front catalog songs" onChange={e => update({ frontCatalogCount: +e.target.value })} />
                </div>
              </div>

              {/* Exclusivity */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header"><span>Exclusivity</span></div>
                <div className="offer-toggle-row">
                  {([3, 6, 12, 18, 24] as const).map(m => (
                    <button key={m} className={`offer-toggle ${internalInputs.exclusivityMonths === m ? 'active' : ''}`}
                      onClick={() => update({ exclusivityMonths: m })}>{m}mo</button>
                  ))}
                </div>
              </div>

              {/* Artist Royalty */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header">
                  <span>Artist Royalty</span>
                  <span>{internalInputs.artistRoyaltyPct}%</span>
                </div>
                <div className="offer-ctrl-slider">
                  <input type="range" min={20} max={85} value={internalInputs.artistRoyaltyPct}
                    aria-label="Artist royalty percentage" onChange={e => update({ artistRoyaltyPct: +e.target.value })} />
                </div>
              </div>

              {/* Options */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header">
                  <span>Options</span>
                  {internalDeal.totalOptionsValue > 0 && <span>{fmt(internalDeal.totalOptionsValue)}</span>}
                </div>
                <div className="offer-toggle-row">
                  {([0, 1, 2, 3, 4] as const).map(n => (
                    <button key={n} className={`offer-toggle ${internalInputs.optionCount === n ? 'active' : ''}`}
                      onClick={() => update({ optionCount: n })}>{n}</button>
                  ))}
                </div>
              </div>

              {/* License Period */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header"><span>License Period</span></div>
                <div className="offer-toggle-row">
                  {(['6yr', '12yr', '20yr', 'perpetuity'] as const).map(lp => (
                    <button key={lp} className={`offer-toggle ${internalInputs.licensePeriod === lp ? 'active' : ''}`}
                      onClick={() => update({ licensePeriod: lp })}>{lp === 'perpetuity' ? 'Perpetuity' : lp.replace('yr', ' Years')}</button>
                  ))}
                </div>
              </div>

              {/* Publishing */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header">
                  <span>Publishing</span>
                  {internalDeal.publishingValue > 0 && <span>{fmt(internalDeal.publishingValue)}</span>}
                </div>
                <div className="offer-toggle-row">
                  {([
                    { val: 'none' as const, label: 'None' },
                    { val: 'admin25' as const, label: '25% Admin' },
                    { val: 'copub50' as const, label: '50% Co-Pub' },
                  ]).map(opt => (
                    <button key={opt.val} className={`offer-toggle ${internalInputs.publishing === opt.val ? 'active' : ''}`}
                      onClick={() => update({ publishing: opt.val })}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Content Budget */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header"><span>Content Budget</span></div>
                <div className="offer-ctrl-slider">
                  <label>Content Budget: {internalInputs.contentBudgetPct}%</label>
                  <input type="range" min={0} max={50} value={internalInputs.contentBudgetPct}
                    aria-label="Content budget percentage" onChange={e => update({ contentBudgetPct: +e.target.value })} />
                </div>
              </div>

              {/* Marketing Budget */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header">
                  <span>Marketing Budget</span>
                  <span>{internalInputs.marketingBudgetPct}% ({fmt(internalDeal.marketingBudgetValue)})</span>
                </div>
                <div className="offer-ctrl-slider">
                  <input type="range" min={5} max={30} value={internalInputs.marketingBudgetPct}
                    aria-label="Marketing budget percentage" onChange={e => update({ marketingBudgetPct: +e.target.value })} />
                </div>
              </div>

              {/* Goodwill Bonus */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header">
                  <span>Goodwill Bonus</span>
                  <span>{internalInputs.goodwillBonusPct || 0}%{internalDeal.goodwillValue > 0 ? ` (${fmt(internalDeal.goodwillValue)})` : ''}</span>
                </div>
                <div className="offer-ctrl-slider">
                  <input type="range" min={0} max={20} step={0.5} value={internalInputs.goodwillBonusPct || 0}
                    aria-label="Goodwill bonus percentage" onChange={e => update({ goodwillBonusPct: +e.target.value })} />
                </div>
              </div>

              {/* Deal Add-Ons */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header"><span>Add-Ons</span></div>
                <label className="offer-check">
                  <input type="checkbox" checked={internalInputs.rightOfFirstRefusal}
                    onChange={e => update({ rightOfFirstRefusal: e.target.checked })} />
                  <span>ROFR (+3%)</span>
                </label>
                <label className="offer-check">
                  <input type="checkbox" checked={internalInputs.upstreaming}
                    onChange={e => update({ upstreaming: e.target.checked })} />
                  <span>Upstreaming (+7%)</span>
                </label>
                <label className="offer-check">
                  <input type="checkbox" checked={internalInputs.ancillaries}
                    onChange={e => update({ ancillaries: e.target.checked })} />
                  <span>Ancillaries (+3.5%)</span>
                </label>
              </div>

              {/* Payment Structure */}
              <div className="offer-ctrl">
                <div className="offer-ctrl-header"><span>Payment Structure</span></div>
                <label className="offer-check">
                  <input type="checkbox" checked={internalInputs.allUpfront}
                    onChange={e => update({ allUpfront: e.target.checked })} />
                  <span>All Upfront (−15%)</span>
                </label>
              </div>

              {/* Payment Schedule */}
              <div className="offer-payment-schedule">
                <h4>Payment Schedule</h4>
                <div className="offer-sched-item"><span>Signing</span><span>{fmt(internalDeal.signingPayment)}</span></div>
                <div className="offer-sched-item"><span>Back Delivery</span><span>{fmt(internalDeal.backCatalogDeliveryPayment)}</span></div>
                {!internalInputs.allUpfront && (
                  <>
                    <div className="offer-sched-item"><span>½ New Songs</span><span>{fmt(internalDeal.halfSongsPayment)}</span></div>
                    <div className="offer-sched-item"><span>Other ½</span><span>{fmt(internalDeal.otherHalfPayment)}</span></div>
                  </>
                )}
              </div>

              {/* KPIs */}
              <div className="offer-kpis">
                <div className="offer-kpi"><span className="offer-kpi-val">{fmt(internalDeal.annualRevenue)}</span><span>Annual Rev</span></div>
                <div className="offer-kpi"><span className="offer-kpi-val">{fmtNum(internalDeal.totalStreams)}</span><span>Streams</span></div>
                <div className="offer-kpi"><span className="offer-kpi-val">${internalDeal.cpm}</span><span>CPM</span></div>
                <div className="offer-kpi"><span className="offer-kpi-val">{internalDeal.songsInCatalog}</span><span>Songs</span></div>
              </div>
            </div>
          ) : (
            <p className="offer-no-data">No streaming data available to model a deal</p>
          )}
        </div>
      </div>

      {/* ── Notes ── */}
      <div className="offer-notes">
        <h3>Internal Notes</h3>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add notes about this deal, negotiation context, artist sentiment…"
          rows={4}
        />
      </div>
    </div>
  );
}
