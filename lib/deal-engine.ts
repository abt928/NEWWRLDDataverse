// ============================================================
// Deal Engine (ported from Songcash)
// Full deal calculator with back catalog, front catalog,
// exclusivity, options, royalty splits, publishing, etc.
// ============================================================

// Self-contained types (no external parser dependency)
export interface SongData {
  title: string;
  earnings: number;
  streams: number;
  [key: string]: unknown;
}

export interface MonthlyData {
  month: string;
  earnings: number;
  streams: number;
  [key: string]: unknown;
}

// ============================================================
// Types
// ============================================================

export interface DealInputs {
  // Back catalog: how many songs from the catalog to include (0 = none, max = all)
  backCatalogCount: number;
  // Front catalog: how many new songs the artist will deliver (0–30)
  frontCatalogCount: number;
  // Exclusivity period in months
  exclusivityMonths: 3 | 6 | 12 | 18 | 24;
  // Options: 0–4
  optionCount: 0 | 1 | 2 | 3 | 4;
  // Option period length in months
  optionPeriodMonths: 8 | 12 | 16;
  // Content budget shift: how much of the advance to move to content (0–100%)
  contentBudgetPct: number;
  // Artist royalty percentage (20–85%)
  artistRoyaltyPct: number;
  // Right of first refusal
  rightOfFirstRefusal: boolean;
  // Publishing deal type
  publishing: 'none' | 'admin25' | 'copub50';
  // Upstreaming
  upstreaming: boolean;
  // Non-recorded ancillaries
  ancillaries: boolean;
  // All upfront (signing + back catalog delivery only)
  allUpfront: boolean;
}

export interface DealOutput {
  // Core values
  backCatalogValue: number;
  frontCatalogValue: number;
  baseOfferValue: number;    // back + front before modifiers

  // Exclusivity-adjusted
  exclusivityMultiplier: number;
  postExclusivityValue: number;

  // Royalty-adjusted
  royaltyMultiplier: number;
  postRoyaltyValue: number;

  // ROFR
  rofrBonus: number;

  // Total deal value (before options/publishing/extras)
  coreDealValue: number;

  // Split: 75% advance / 25% marketing
  advanceBudget: number;
  marketingBudget: number;

  // Payment schedule (of advance)
  signingPayment: number;
  backCatalogDeliveryPayment: number;
  halfSongsPayment: number;
  otherHalfPayment: number;
  allUpfrontDiscount: number; // 15% discount if all upfront

  // Content budget shift
  contentBudget: number;        // amount moved from advance
  contentBudgetBonus: number;   // 10% increase on moved amount
  adjustedAdvance: number;      // advance after content shift

  // Options
  optionValue: number;          // per option
  totalOptionsValue: number;    // all options combined
  optionPeriodMultiplier: number;

  // Publishing
  publishingValue: number;

  // Extras
  upstreamingValue: number;
  ancillariesValue: number;

  // Grand total
  totalDealValue: number;

  // Metadata
  annualRevenue: number;
  totalStreams: number;
  catalogMonths: number;
  cpm: number;
  songsInCatalog: number;
  avgSongEarningsPerYear: number;
}

export const DEFAULT_INPUTS: DealInputs = {
  backCatalogCount: 0,
  frontCatalogCount: 1,
  exclusivityMonths: 12,
  optionCount: 0,
  optionPeriodMonths: 12,
  contentBudgetPct: 0,
  artistRoyaltyPct: 50,
  rightOfFirstRefusal: false,
  publishing: 'none',
  upstreaming: false,
  ancillaries: false,
  allUpfront: false,
};

// ============================================================
// Main Calculator
// ============================================================

export function calculateDeal(
  songs: SongData[],
  monthlyRevenue: MonthlyData[],
  inputs: DealInputs,
): DealOutput {
  const totalSongs = songs.length;

  // ── Catalog metrics ──────────────────────────────────
  const totalEarnings = songs.reduce((s, song) => s + song.earnings, 0);
  const totalStreams = songs.reduce((s, song) => s + song.streams, 0);
  const catalogMonths = monthlyRevenue.length || 1;
  const cpm = totalStreams > 0 ? (totalEarnings / totalStreams) * 1000 : 3;

  // Trailing 12-month revenue (or annualized if < 12 months)
  const sorted = [...monthlyRevenue].sort((a, b) => b.month.localeCompare(a.month));
  const recent12 = sorted.slice(0, Math.min(12, sorted.length));
  const recent12Total = recent12.reduce((s, m) => s + m.earnings, 0);
  const annualRevenue = recent12.length >= 12
    ? recent12Total
    : recent12.length > 0
      ? (recent12Total / recent12.length) * 12
      : 0;

  // ── Back Catalog Value ───────────────────────────────
  // Songs are already sorted by earnings (desc from parser).
  // As you slide from smallest to largest, the offer grows by % of streams included.
  // Small bonus for adding the biggest songs.
  const songsSorted = [...songs].sort((a, b) => a.earnings - b.earnings); // ascending for slider
  const clampedBack = Math.min(Math.max(inputs.backCatalogCount, 0), totalSongs);

  let backCatalogValue = 0;
  if (clampedBack > 0) {
    // Take the top N songs (from smallest up)
    const includedSongs = songsSorted.slice(0, clampedBack);
    const includedStreams = includedSongs.reduce((s, song) => s + song.streams, 0);
    const streamsPct = totalStreams > 0 ? includedStreams / totalStreams : 0;

    // Base: annual revenue × stream share
    backCatalogValue = annualRevenue * streamsPct;

    // Bonus for including the biggest songs (top 10% of catalog)
    const bigSongThreshold = Math.ceil(totalSongs * 0.9);
    const bigSongsIncluded = includedSongs.filter(
      (_, idx) => (songsSorted.indexOf(includedSongs[idx]) >= bigSongThreshold)
    ).length;
    const bigSongBonusPct = bigSongsIncluded > 0
      ? Math.min(bigSongsIncluded * 0.03, 0.15) // 3% per big song, max 15%
      : 0;
    backCatalogValue *= (1 + bigSongBonusPct);
  }

  // ── Front Catalog Value ──────────────────────────────
  // Based on average earnings from the "middle 60%" of the catalog
  // (excluding top 20% and bottom 10%)
  const earningsSorted = [...songs].sort((a, b) => a.earnings - b.earnings);
  const bottom10Idx = Math.floor(totalSongs * 0.10);
  const top20Idx = Math.ceil(totalSongs * 0.80);
  const middleSongs = earningsSorted.slice(bottom10Idx, top20Idx);
  const middleAvgEarnings = middleSongs.length > 0
    ? middleSongs.reduce((s, song) => s + song.earnings, 0) / middleSongs.length
    : 0;

  // Annualize: what one "average middle" song makes per year
  const avgSongEarningsPerYear = catalogMonths > 0
    ? (middleAvgEarnings / catalogMonths) * 12
    : middleAvgEarnings;

  const clampedFront = Math.min(Math.max(inputs.frontCatalogCount, 0), 30);
  let frontCatalogValue = 0;
  for (let i = 0; i < clampedFront; i++) {
    let songValue = avgSongEarningsPerYear;
    // Diminishing returns after song #8
    if (i >= 8) {
      const diminishFactor = Math.max(0.4, 1 - (i - 8) * 0.05); // 5% less per song after 8
      songValue *= diminishFactor;
    }
    frontCatalogValue += songValue;
  }

  // ── Base Offer ───────────────────────────────────────
  const baseOfferValue = backCatalogValue + frontCatalogValue;

  // ── Exclusivity Modifier ─────────────────────────────
  let exclusivityMultiplier = 1.0;
  switch (inputs.exclusivityMonths) {
    case 3:  exclusivityMultiplier = 0.55; break; // drastic cut
    case 6:  exclusivityMultiplier = 0.70; break; // drastic cut
    case 12: exclusivityMultiplier = 1.00; break; // regular
    case 18: exclusivityMultiplier = 1.04; break; // 4% boost
    case 24: exclusivityMultiplier = 1.06; break; // 6% boost
  }
  const postExclusivityValue = baseOfferValue * exclusivityMultiplier;

  // ── Artist Royalty Modifier ──────────────────────────
  // Base: 50%. Below 50% → every 10% lower = 20% decrease in budgets.
  // Above 50% → every 1% higher = 0.25% increase.
  let royaltyMultiplier = 1.0;
  const royaltyPct = Math.min(Math.max(inputs.artistRoyaltyPct, 20), 85);
  if (royaltyPct < 50) {
    const pctBelow = 50 - royaltyPct;
    const decreasePct = (pctBelow / 10) * 0.20; // 20% decrease per 10% lower
    royaltyMultiplier = 1 - decreasePct;
  } else if (royaltyPct > 50) {
    const pctAbove = royaltyPct - 50;
    const increasePct = pctAbove * 0.0025; // 1/4 of each %
    royaltyMultiplier = 1 + increasePct;
  }
  const postRoyaltyValue = postExclusivityValue * royaltyMultiplier;

  // ── ROFR ─────────────────────────────────────────────
  const rofrBonus = inputs.rightOfFirstRefusal ? postRoyaltyValue * 0.03 : 0;

  // ── Core Deal Value ──────────────────────────────────
  const coreDealValue = postRoyaltyValue + rofrBonus;

  // ── Split: 75% Advance / 25% Marketing ───────────────
  const advanceBudgetRaw = coreDealValue * 0.75;
  const marketingBudget = coreDealValue * 0.25;

  // ── Content Budget Shift ─────────────────────────────
  const contentShiftPct = Math.min(Math.max(inputs.contentBudgetPct, 0), 50) / 100;
  const contentShiftAmount = advanceBudgetRaw * contentShiftPct;
  const contentBudgetBonus = contentShiftAmount * 0.10; // 10% increase on shifted amount
  const contentBudget = contentShiftAmount + contentBudgetBonus;
  const adjustedAdvance = advanceBudgetRaw - contentShiftAmount;

  // ── Payment Schedule (of adjusted advance) ───────────
  let signingPayment: number;
  let backCatalogDeliveryPayment: number;
  let halfSongsPayment: number;
  let otherHalfPayment: number;
  let allUpfrontDiscount = 0;

  if (inputs.allUpfront) {
    allUpfrontDiscount = adjustedAdvance * 0.15;
    const discountedAdvance = adjustedAdvance - allUpfrontDiscount;
    signingPayment = discountedAdvance * 0.50;
    backCatalogDeliveryPayment = discountedAdvance * 0.50;
    halfSongsPayment = 0;
    otherHalfPayment = 0;
  } else {
    signingPayment = adjustedAdvance * 0.25;
    backCatalogDeliveryPayment = adjustedAdvance * 0.25;
    halfSongsPayment = adjustedAdvance * 0.125;
    otherHalfPayment = adjustedAdvance * 0.125;
  }

  // ── Options ──────────────────────────────────────────
  // Each option = 4 months of catalog revenue + front catalog value
  // Minimum 10 new songs for the option, but if front > 10, use that
  const optionFrontCount = Math.max(clampedFront, 10);
  let optionFrontValue = 0;
  for (let i = 0; i < optionFrontCount; i++) {
    let songValue = avgSongEarningsPerYear;
    if (i >= 8) {
      const diminishFactor = Math.max(0.4, 1 - (i - 8) * 0.05);
      songValue *= diminishFactor;
    }
    optionFrontValue += songValue;
  }
  const fourMonthsCatalog = annualRevenue * (4 / 12);
  const optionBaseValue = fourMonthsCatalog + optionFrontValue;

  let optionPeriodMultiplier = 1.0;
  switch (inputs.optionPeriodMonths) {
    case 8:  optionPeriodMultiplier = 0.92; break; // 8% decrease
    case 12: optionPeriodMultiplier = 1.00; break;
    case 16: optionPeriodMultiplier = 1.08; break; // 8% increase
  }

  const optionValue = optionBaseValue * optionPeriodMultiplier;
  const clampedOptions = Math.min(Math.max(inputs.optionCount, 0), 4);
  const totalOptionsValue = optionValue * clampedOptions;

  // ── Publishing ───────────────────────────────────────
  let publishingValue = 0;
  if (inputs.publishing === 'admin25') {
    publishingValue = annualRevenue * 0.15; // 15% of last year
  } else if (inputs.publishing === 'copub50') {
    publishingValue = annualRevenue * 0.15 * 1.8; // same × 1.8x
  }

  // ── Upstreaming ──────────────────────────────────────
  // 7% of (core deal value — options — publishing)
  const upstreamingValue = inputs.upstreaming
    ? coreDealValue * 0.07
    : 0;

  // ── Non-recorded Ancillaries ─────────────────────────
  // 3.5% of (core deal value — options — publishing)
  const ancillariesValue = inputs.ancillaries
    ? coreDealValue * 0.035
    : 0;

  // ── Grand Total ──────────────────────────────────────
  const totalDealValue = coreDealValue
    + totalOptionsValue
    + publishingValue
    + upstreamingValue
    + ancillariesValue
    - allUpfrontDiscount;

  return {
    backCatalogValue: round(backCatalogValue),
    frontCatalogValue: round(frontCatalogValue),
    baseOfferValue: round(baseOfferValue),
    exclusivityMultiplier,
    postExclusivityValue: round(postExclusivityValue),
    royaltyMultiplier,
    postRoyaltyValue: round(postRoyaltyValue),
    rofrBonus: round(rofrBonus),
    coreDealValue: round(coreDealValue),
    advanceBudget: round(advanceBudgetRaw),
    marketingBudget: round(marketingBudget),
    signingPayment: round(signingPayment),
    backCatalogDeliveryPayment: round(backCatalogDeliveryPayment),
    halfSongsPayment: round(halfSongsPayment),
    otherHalfPayment: round(otherHalfPayment),
    allUpfrontDiscount: round(allUpfrontDiscount),
    contentBudget: round(contentBudget),
    contentBudgetBonus: round(contentBudgetBonus),
    adjustedAdvance: round(adjustedAdvance),
    optionValue: round(optionValue),
    totalOptionsValue: round(totalOptionsValue),
    optionPeriodMultiplier,
    publishingValue: round(publishingValue),
    upstreamingValue: round(upstreamingValue),
    ancillariesValue: round(ancillariesValue),
    totalDealValue: round(totalDealValue),
    annualRevenue: round(annualRevenue),
    totalStreams,
    catalogMonths,
    cpm: Math.round(cpm * 100) / 100,
    songsInCatalog: totalSongs,
    avgSongEarningsPerYear: round(avgSongEarningsPerYear),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
