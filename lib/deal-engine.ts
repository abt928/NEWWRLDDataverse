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
  // Goodwill bonus (internal use — displayed to artist as a bonus gesture)
  goodwillBonus: number;
}

// ============================================================
// Formula Overrides — every hardcoded multiplier is tunable
// ============================================================

export interface FormulaOverrides {
  // Exclusivity multipliers
  exclusivity3mo: number;       // default 0.55
  exclusivity6mo: number;       // default 0.70
  exclusivity12mo: number;      // default 1.00
  exclusivity18mo: number;      // default 1.04
  exclusivity24mo: number;      // default 1.06
  // Royalty formula
  royaltyDecreasePerTen: number; // default 0.20 (20% decrease per 10% below 50)
  royaltyIncreasePer1: number;   // default 0.0025 (0.25% increase per 1% above 50)
  // ROFR bonus
  rofrPct: number;               // default 0.03
  // Budget split
  advanceSplitPct: number;       // default 0.75
  // Content budget bonus
  contentBonusPct: number;       // default 0.10
  // All-upfront discount
  allUpfrontDiscountPct: number; // default 0.15
  // Option period multipliers
  optionPeriod8mo: number;       // default 0.92
  optionPeriod12mo: number;      // default 1.00
  optionPeriod16mo: number;      // default 1.08
  // Publishing
  publishingAdminPct: number;    // default 0.15
  publishingCopubMultiplier: number; // default 1.80
  // Extras
  upstreamingPct: number;        // default 0.07
  ancillariesPct: number;        // default 0.035
  // Big song bonus
  bigSongBonusPerSong: number;   // default 0.03
  bigSongBonusMax: number;       // default 0.15
  // Front catalog diminishing returns
  frontDiminishPerSong: number;  // default 0.05
  frontDiminishFloor: number;    // default 0.40
  frontDiminishAfter: number;    // default 8 (start diminishing after song #8)
}

export const DEFAULT_OVERRIDES: FormulaOverrides = {
  exclusivity3mo: 0.55,
  exclusivity6mo: 0.70,
  exclusivity12mo: 1.00,
  exclusivity18mo: 1.04,
  exclusivity24mo: 1.06,
  royaltyDecreasePerTen: 0.20,
  royaltyIncreasePer1: 0.0025,
  rofrPct: 0.03,
  advanceSplitPct: 0.75,
  contentBonusPct: 0.10,
  allUpfrontDiscountPct: 0.15,
  optionPeriod8mo: 0.92,
  optionPeriod12mo: 1.00,
  optionPeriod16mo: 1.08,
  publishingAdminPct: 0.15,
  publishingCopubMultiplier: 1.80,
  upstreamingPct: 0.07,
  ancillariesPct: 0.035,
  bigSongBonusPerSong: 0.03,
  bigSongBonusMax: 0.15,
  frontDiminishPerSong: 0.05,
  frontDiminishFloor: 0.40,
  frontDiminishAfter: 8,
};

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

  // Split: advance / marketing
  advanceBudget: number;
  marketingBudget: number;

  // Payment schedule (of advance)
  signingPayment: number;
  backCatalogDeliveryPayment: number;
  halfSongsPayment: number;
  otherHalfPayment: number;
  allUpfrontDiscount: number;

  // Content budget shift
  contentBudget: number;
  contentBudgetBonus: number;
  adjustedAdvance: number;

  // Options
  optionValue: number;
  totalOptionsValue: number;
  optionPeriodMultiplier: number;

  // Publishing
  publishingValue: number;

  // Extras
  upstreamingValue: number;
  ancillariesValue: number;

  // Grand total
  totalDealValue: number;

  // Goodwill bonus
  goodwillBonus: number;

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
  goodwillBonus: 0,
};

// ============================================================
// Main Calculator
// ============================================================

export function calculateDeal(
  songs: SongData[],
  monthlyRevenue: MonthlyData[],
  inputs: DealInputs,
  overrides?: Partial<FormulaOverrides>,
): DealOutput {
  const f = { ...DEFAULT_OVERRIDES, ...overrides };
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
  const songsSorted = [...songs].sort((a, b) => a.earnings - b.earnings);
  const clampedBack = Math.min(Math.max(inputs.backCatalogCount, 0), totalSongs);

  let backCatalogValue = 0;
  if (clampedBack > 0) {
    const includedSongs = songsSorted.slice(0, clampedBack);
    const includedStreams = includedSongs.reduce((s, song) => s + song.streams, 0);
    const streamsPct = totalStreams > 0 ? includedStreams / totalStreams : 0;

    backCatalogValue = annualRevenue * streamsPct;

    // Bonus for including the biggest songs (top 10% of catalog)
    const bigSongThreshold = Math.ceil(totalSongs * 0.9);
    const bigSongsIncluded = includedSongs.filter(
      (_, idx) => (songsSorted.indexOf(includedSongs[idx]) >= bigSongThreshold)
    ).length;
    const bigSongBonusPct = bigSongsIncluded > 0
      ? Math.min(bigSongsIncluded * f.bigSongBonusPerSong, f.bigSongBonusMax)
      : 0;
    backCatalogValue *= (1 + bigSongBonusPct);
  }

  // ── Front Catalog Value ──────────────────────────────
  const earningsSorted = [...songs].sort((a, b) => a.earnings - b.earnings);
  const bottom10Idx = Math.floor(totalSongs * 0.10);
  const top20Idx = Math.ceil(totalSongs * 0.80);
  const middleSongs = earningsSorted.slice(bottom10Idx, top20Idx);
  const middleAvgEarnings = middleSongs.length > 0
    ? middleSongs.reduce((s, song) => s + song.earnings, 0) / middleSongs.length
    : 0;

  const avgSongEarningsPerYear = catalogMonths > 0
    ? (middleAvgEarnings / catalogMonths) * 12
    : middleAvgEarnings;

  const clampedFront = Math.min(Math.max(inputs.frontCatalogCount, 0), 30);
  let frontCatalogValue = 0;
  for (let i = 0; i < clampedFront; i++) {
    let songValue = avgSongEarningsPerYear;
    if (i >= f.frontDiminishAfter) {
      const diminishFactor = Math.max(f.frontDiminishFloor, 1 - (i - f.frontDiminishAfter) * f.frontDiminishPerSong);
      songValue *= diminishFactor;
    }
    frontCatalogValue += songValue;
  }

  // ── Base Offer ───────────────────────────────────────
  const baseOfferValue = backCatalogValue + frontCatalogValue;

  // ── Exclusivity Modifier ─────────────────────────────
  let exclusivityMultiplier = 1.0;
  switch (inputs.exclusivityMonths) {
    case 3:  exclusivityMultiplier = f.exclusivity3mo; break;
    case 6:  exclusivityMultiplier = f.exclusivity6mo; break;
    case 12: exclusivityMultiplier = f.exclusivity12mo; break;
    case 18: exclusivityMultiplier = f.exclusivity18mo; break;
    case 24: exclusivityMultiplier = f.exclusivity24mo; break;
  }
  const postExclusivityValue = baseOfferValue * exclusivityMultiplier;

  // ── Artist Royalty Modifier ──────────────────────────
  let royaltyMultiplier = 1.0;
  const royaltyPct = Math.min(Math.max(inputs.artistRoyaltyPct, 20), 85);
  if (royaltyPct < 50) {
    const pctBelow = 50 - royaltyPct;
    const decreasePct = (pctBelow / 10) * f.royaltyDecreasePerTen;
    royaltyMultiplier = 1 - decreasePct;
  } else if (royaltyPct > 50) {
    const pctAbove = royaltyPct - 50;
    const increasePct = pctAbove * f.royaltyIncreasePer1;
    royaltyMultiplier = 1 + increasePct;
  }
  const postRoyaltyValue = postExclusivityValue * royaltyMultiplier;

  // ── ROFR ─────────────────────────────────────────────
  const rofrBonus = inputs.rightOfFirstRefusal ? postRoyaltyValue * f.rofrPct : 0;

  // ── Core Deal Value ──────────────────────────────────
  const coreDealValue = postRoyaltyValue + rofrBonus;

  // ── Split: Advance / Marketing ───────────────────────
  const advanceBudgetRaw = coreDealValue * f.advanceSplitPct;
  const marketingBudget = coreDealValue * (1 - f.advanceSplitPct);

  // ── Content Budget Shift ─────────────────────────────
  const contentShiftPct = Math.min(Math.max(inputs.contentBudgetPct, 0), 50) / 100;
  const contentShiftAmount = advanceBudgetRaw * contentShiftPct;
  const contentBudgetBonus = contentShiftAmount * f.contentBonusPct;
  const contentBudget = contentShiftAmount + contentBudgetBonus;
  const adjustedAdvance = advanceBudgetRaw - contentShiftAmount;

  // ── Payment Schedule (of adjusted advance) ───────────
  let signingPayment: number;
  let backCatalogDeliveryPayment: number;
  let halfSongsPayment: number;
  let otherHalfPayment: number;
  let allUpfrontDiscount = 0;

  if (inputs.allUpfront) {
    allUpfrontDiscount = adjustedAdvance * f.allUpfrontDiscountPct;
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
  const optionFrontCount = Math.max(clampedFront, 10);
  let optionFrontValue = 0;
  for (let i = 0; i < optionFrontCount; i++) {
    let songValue = avgSongEarningsPerYear;
    if (i >= f.frontDiminishAfter) {
      const diminishFactor = Math.max(f.frontDiminishFloor, 1 - (i - f.frontDiminishAfter) * f.frontDiminishPerSong);
      songValue *= diminishFactor;
    }
    optionFrontValue += songValue;
  }
  const fourMonthsCatalog = annualRevenue * (4 / 12);
  const optionBaseValue = fourMonthsCatalog + optionFrontValue;

  let optionPeriodMultiplier = 1.0;
  switch (inputs.optionPeriodMonths) {
    case 8:  optionPeriodMultiplier = f.optionPeriod8mo; break;
    case 12: optionPeriodMultiplier = f.optionPeriod12mo; break;
    case 16: optionPeriodMultiplier = f.optionPeriod16mo; break;
  }

  const optionValue = optionBaseValue * optionPeriodMultiplier;
  const clampedOptions = Math.min(Math.max(inputs.optionCount, 0), 4);
  const totalOptionsValue = optionValue * clampedOptions;

  // ── Publishing ───────────────────────────────────────
  let publishingValue = 0;
  if (inputs.publishing === 'admin25') {
    publishingValue = annualRevenue * f.publishingAdminPct;
  } else if (inputs.publishing === 'copub50') {
    publishingValue = annualRevenue * f.publishingAdminPct * f.publishingCopubMultiplier;
  }

  // ── Upstreaming ──────────────────────────────────────
  const upstreamingValue = inputs.upstreaming
    ? coreDealValue * f.upstreamingPct
    : 0;

  // ── Non-recorded Ancillaries ─────────────────────────
  const ancillariesValue = inputs.ancillaries
    ? coreDealValue * f.ancillariesPct
    : 0;

  // ── Grand Total ──────────────────────────────────────
  const goodwillBonus = Math.max(inputs.goodwillBonus || 0, 0);
  const totalDealValue = coreDealValue
    + totalOptionsValue
    + publishingValue
    + upstreamingValue
    + ancillariesValue
    - allUpfrontDiscount
    + goodwillBonus;

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
    goodwillBonus: round(goodwillBonus),
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
