// ============================================================
// Deal Engine V2
// Full deal calculator — rebuilt per client spec:
//   Back Catalog (monthly multiple) + Front Catalog (filtered avg)
//   → Base Deal → + Options → Subtotal
//   → × Exclusivity → × Royalty → × License Period → × Goodwill %
//   = Final Deal Value
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
  // ── Data Range ──────────────────────────────────────────
  dataRange: '3M' | '6M' | '12M' | 'YTD' | 'ALL' | 'custom';
  dataRangeStart: string | null;  // "2025-01" format, for custom range
  dataRangeEnd: string | null;    // "2025-06" format, for custom range

  // ── Back Catalog ────────────────────────────────────────
  backCatalogCount: number;
  backCatalogMonthMultiple: number;        // 1–24, decimals ok (e.g. 1.79)
  backCatalogSortOrder: 'low-high' | 'high-low';

  // ── Front Catalog ───────────────────────────────────────
  frontCatalogCount: number;               // 0–30 new songs
  frontCatalogBaseValue: number | null;     // null = use calculated filtered avg
  frontCatalogDeteriorationStart: number;   // song # where decay begins
  frontCatalogDeteriorationPct: number;     // % decay per song after start
  frontCatalogMonthMultiplier: number;      // converts monthly → deal value

  // ── Exclusivity ─────────────────────────────────────────
  exclusivityMonths: 3 | 6 | 12 | 18 | 24;

  // ── License Period (NEW) ────────────────────────────────
  licensePeriod: '6yr' | '12yr' | '20yr' | 'perpetuity';

  // ── Artist Royalty ──────────────────────────────────────
  artistRoyaltyPct: number;                // 20–85%

  // ── Options ─────────────────────────────────────────────
  optionCount: 0 | 1 | 2 | 3 | 4;
  optionBaseValue: number | null;          // null = use front catalog value
  optionPct: number;                       // % of base for first option (e.g. 80)
  optionDecayPct: number;                  // decay per subsequent option (e.g. 10)

  // ── Publishing (unchanged) ──────────────────────────────
  publishing: 'none' | 'admin25' | 'copub50';

  // ── Content Budget ──────────────────────────────────────
  contentBudgetPct: number;                // 0–50%

  // ── Marketing Budget (NEW) ──────────────────────────────
  marketingBudgetPct: number;              // % of total deal allocated to marketing

  // ── Goodwill Bonus (reworked) ───────────────────────────
  goodwillBonusPct: number;                // % multiplier applied globally (e.g. 5 = +5%)

  // ── Deal Add-Ons (preserved) ────────────────────────────
  rightOfFirstRefusal: boolean;
  upstreaming: boolean;
  ancillaries: boolean;

  // ── Payment Structure (preserved) ───────────────────────
  allUpfront: boolean;
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

  // License Period multipliers (NEW)
  license6yr: number;           // default 0.60
  license12yr: number;          // default 0.85
  license20yr: number;          // default 1.00
  licensePerpetual: number;     // default 1.15

  // Royalty formula
  royaltyDecreasePerTen: number; // default 0.20 (20% decrease per 10% below 50)
  royaltyIncreasePer1: number;   // default 0.0025 (0.25% increase per 1% above 50)

  // Publishing
  publishingAdminPct: number;    // default 0.15
  publishingCopubMultiplier: number; // default 1.80

  // Marketing budget constraints (NEW)
  marketingBudgetMinPct: number; // default 5
  marketingBudgetMaxPct: number; // default 30

  // Front catalog — outlier exclusion threshold
  frontCatalogOutlierPct: number; // default 0.10 (exclude songs >10% of total revenue)

  // Deal add-ons (preserved)
  rofrPct: number;               // default 0.03
  upstreamingPct: number;        // default 0.07
  ancillariesPct: number;        // default 0.035
  allUpfrontDiscountPct: number; // default 0.15
  contentBonusPct: number;       // default 0.10
  advanceSplitPct: number;       // default 0.75 (75% advance, 25% marketing)
}

export const DEFAULT_OVERRIDES: FormulaOverrides = {
  exclusivity3mo: 0.55,
  exclusivity6mo: 0.70,
  exclusivity12mo: 1.00,
  exclusivity18mo: 1.04,
  exclusivity24mo: 1.06,
  license6yr: 0.60,
  license12yr: 0.85,
  license20yr: 1.00,
  licensePerpetual: 1.15,
  royaltyDecreasePerTen: 0.20,
  royaltyIncreasePer1: 0.0025,
  publishingAdminPct: 0.15,
  publishingCopubMultiplier: 1.80,
  marketingBudgetMinPct: 5,
  marketingBudgetMaxPct: 30,
  frontCatalogOutlierPct: 0.10,
  rofrPct: 0.03,
  upstreamingPct: 0.07,
  ancillariesPct: 0.035,
  allUpfrontDiscountPct: 0.15,
  contentBonusPct: 0.10,
  advanceSplitPct: 0.75,
};

// ============================================================
// Output
// ============================================================

export interface DealOutput {
  // ── Back Catalog ────────────────────────────────────────
  backCatalogValue: number;
  backCatalogSongsIncluded: string[];      // titles of songs included (for dropdown)

  // ── Front Catalog ───────────────────────────────────────
  frontCatalogValue: number;
  suggestedFrontBaseValue: number;         // the calculated filtered average (monthly)

  // ── Base Deal ───────────────────────────────────────────
  baseOfferValue: number;                  // back + front

  // ── Options ─────────────────────────────────────────────
  optionBreakdown: number[];               // value per option
  totalOptionsValue: number;

  // ── Subtotal ────────────────────────────────────────────
  subtotalBeforeModifiers: number;         // base + options

  // ── Exclusivity ─────────────────────────────────────────
  exclusivityMultiplier: number;
  postExclusivityValue: number;

  // ── Royalty ─────────────────────────────────────────────
  royaltyMultiplier: number;
  postRoyaltyValue: number;

  // ── License Period ──────────────────────────────────────
  licensePeriodMultiplier: number;
  postLicenseValue: number;

  // ── Goodwill ────────────────────────────────────────────
  goodwillMultiplier: number;              // 1 + (pct / 100)
  goodwillValue: number;                   // the added amount
  postGoodwillValue: number;

  // ── Deal Add-Ons (preserved) ────────────────────────────
  rofrBonus: number;
  upstreamingValue: number;
  ancillariesValue: number;

  // ── Publishing ──────────────────────────────────────────
  publishingValue: number;

  // ── Content Budget ──────────────────────────────────────
  contentBudget: number;
  contentBudgetBonus: number;

  // ── Marketing Budget ────────────────────────────────────
  marketingBudgetValue: number;

  // ── Payment Structure (preserved) ───────────────────────
  allUpfrontDiscount: number;
  advanceBudget: number;
  marketingBudget: number;                 // from advance split
  signingPayment: number;
  backCatalogDeliveryPayment: number;
  halfSongsPayment: number;
  otherHalfPayment: number;
  adjustedAdvance: number;

  // ── Grand Total ─────────────────────────────────────────
  totalDealValue: number;

  // ── Metadata ────────────────────────────────────────────
  annualRevenue: number;
  totalStreams: number;
  catalogMonths: number;
  cpm: number;
  songsInCatalog: number;
  avgMonthlyRevenuePerSong: number;        // before outlier filtering
  filteredSongsCount: number;              // songs used in filtered avg
  filteredMonthsCount: number;             // months in data range

  // ── Compat ──────────────────────────────────────────────
  goodwillBonus: number;                   // alias of goodwillValue
}

export const DEFAULT_INPUTS: DealInputs = {
  dataRange: '12M',
  dataRangeStart: null,
  dataRangeEnd: null,
  backCatalogCount: 0,
  backCatalogMonthMultiple: 12,
  backCatalogSortOrder: 'low-high',
  frontCatalogCount: 1,
  frontCatalogBaseValue: null,
  frontCatalogDeteriorationStart: 8,
  frontCatalogDeteriorationPct: 5,
  frontCatalogMonthMultiplier: 12,
  exclusivityMonths: 12,
  licensePeriod: 'perpetuity',
  artistRoyaltyPct: 50,
  optionCount: 0,
  optionBaseValue: null,
  optionPct: 80,
  optionDecayPct: 10,
  publishing: 'none',
  contentBudgetPct: 0,
  marketingBudgetPct: 10,
  goodwillBonusPct: 0,
  rightOfFirstRefusal: false,
  upstreaming: false,
  ancillaries: false,
  allUpfront: false,
};

// ============================================================
// Data Range Filtering
// ============================================================

function filterByDataRange(
  songs: SongData[],
  monthlyRevenue: MonthlyData[],
  inputs: DealInputs,
): { filteredSongs: SongData[]; filteredMonthly: MonthlyData[] } {
  if (inputs.dataRange === 'ALL') {
    return { filteredSongs: songs, filteredMonthly: monthlyRevenue };
  }

  const sorted = [...monthlyRevenue].sort((a, b) => b.month.localeCompare(a.month));
  if (sorted.length === 0) return { filteredSongs: songs, filteredMonthly: [] };

  let startMonth: string;
  let endMonth: string = sorted[0].month; // most recent

  const now = new Date();

  switch (inputs.dataRange) {
    case '3M': {
      const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      startMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      break;
    }
    case '6M': {
      const d = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      startMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      break;
    }
    case '12M': {
      const d = new Date(now.getFullYear(), now.getMonth() - 12, 1);
      startMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      break;
    }
    case 'YTD': {
      startMonth = `${now.getFullYear()}-01`;
      break;
    }
    case 'custom': {
      startMonth = inputs.dataRangeStart || sorted[sorted.length - 1].month;
      endMonth = inputs.dataRangeEnd || sorted[0].month;
      break;
    }
    default:
      startMonth = sorted[sorted.length - 1].month;
  }

  const filteredMonthly = monthlyRevenue.filter(
    m => m.month >= startMonth && m.month <= endMonth
  );

  // Re-aggregate songs based on filtered months
  // NOTE: We can't perfectly re-aggregate per-song monthly data from the
  // aggregated song data, so we scale song values proportionally based on
  // the fraction of months included
  const totalMonths = monthlyRevenue.length || 1;
  const filteredMonths = filteredMonthly.length || 1;
  const totalRev = monthlyRevenue.reduce((s, m) => s + m.earnings, 0);
  const filteredRev = filteredMonthly.reduce((s, m) => s + m.earnings, 0);
  const revRatio = totalRev > 0 ? filteredRev / totalRev : filteredMonths / totalMonths;

  const filteredSongs = songs.map(s => ({
    ...s,
    earnings: s.earnings * revRatio,
    streams: Math.round(s.streams * revRatio),
  }));

  return { filteredSongs, filteredMonthly };
}

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

  // ── Data Range Filtering ──────────────────────────────
  const { filteredSongs, filteredMonthly } = filterByDataRange(songs, monthlyRevenue, inputs);

  const totalSongs = filteredSongs.length;
  const totalEarnings = filteredSongs.reduce((s, song) => s + song.earnings, 0);
  const totalStreams = filteredSongs.reduce((s, song) => s + song.streams, 0);
  const catalogMonths = filteredMonthly.length || 1;
  const cpm = totalStreams > 0 ? (totalEarnings / totalStreams) * 1000 : 3;

  // ── Revenue Metrics ───────────────────────────────────
  const monthlyTotalRev = filteredMonthly.reduce((s, m) => s + m.earnings, 0);
  const avgMonthlyRevenue = catalogMonths > 0 ? monthlyTotalRev / catalogMonths : 0;

  // Trailing 12-month or annualized
  const sortedMonths = [...filteredMonthly].sort((a, b) => b.month.localeCompare(a.month));
  const recent12 = sortedMonths.slice(0, Math.min(12, sortedMonths.length));
  const recent12Total = recent12.reduce((s, m) => s + m.earnings, 0);
  const annualRevenue = recent12.length >= 12
    ? recent12Total
    : recent12.length > 0
      ? (recent12Total / recent12.length) * 12
      : 0;

  // ── Average monthly revenue per song ──────────────────
  const avgMonthlyRevenuePerSong = totalSongs > 0 && catalogMonths > 0
    ? (totalEarnings / totalSongs) / catalogMonths
    : 0;

  // ══════════════════════════════════════════════════════
  // STEP 1 — BACK CATALOG
  // Each song value = Average Monthly Revenue × Selected Month Multiple
  // ══════════════════════════════════════════════════════

  const songsSorted = inputs.backCatalogSortOrder === 'high-low'
    ? [...filteredSongs].sort((a, b) => b.earnings - a.earnings)
    : [...filteredSongs].sort((a, b) => a.earnings - b.earnings);

  const clampedBack = Math.min(Math.max(inputs.backCatalogCount, 0), totalSongs);

  let backCatalogValue = 0;
  const backCatalogSongsIncluded: string[] = [];
  if (clampedBack > 0) {
    const includedSongs = songsSorted.slice(0, clampedBack);
    for (const song of includedSongs) {
      const songMonthlyAvg = catalogMonths > 0 ? song.earnings / catalogMonths : 0;
      backCatalogValue += songMonthlyAvg * inputs.backCatalogMonthMultiple;
      backCatalogSongsIncluded.push(song.title);
    }
  }

  // ══════════════════════════════════════════════════════
  // STEP 2 — FRONT CATALOG
  // Filtered average (exclude outliers) × month multiplier × deterioration
  // ══════════════════════════════════════════════════════

  // Calculate filtered average: exclude songs > X% of total revenue
  const outlierThreshold = totalEarnings * f.frontCatalogOutlierPct;
  const nonOutlierSongs = filteredSongs.filter(s => s.earnings <= outlierThreshold);
  const filteredSongsCount = nonOutlierSongs.length;

  const filteredAvgMonthly = filteredSongsCount > 0 && catalogMonths > 0
    ? (nonOutlierSongs.reduce((s, song) => s + song.earnings, 0) / filteredSongsCount) / catalogMonths
    : avgMonthlyRevenuePerSong;

  const suggestedFrontBaseValue = filteredAvgMonthly;

  // Use user override or calculated value
  const baseValuePerSongMonthly = inputs.frontCatalogBaseValue !== null && inputs.frontCatalogBaseValue >= 0
    ? inputs.frontCatalogBaseValue
    : suggestedFrontBaseValue;

  const clampedFront = Math.min(Math.max(inputs.frontCatalogCount, 0), 30);
  const deteriorationStart = Math.max(inputs.frontCatalogDeteriorationStart, 1);
  const deteriorationPct = Math.max(inputs.frontCatalogDeteriorationPct, 0) / 100;

  let frontCatalogValue = 0;
  for (let i = 0; i < clampedFront; i++) {
    let songMonthly = baseValuePerSongMonthly;
    const songNum = i + 1;
    if (songNum > deteriorationStart) {
      const stepsDecayed = songNum - deteriorationStart;
      const decayFactor = Math.max(0, 1 - stepsDecayed * deteriorationPct);
      songMonthly *= decayFactor;
    }
    // Convert monthly value → deal value via month multiplier
    frontCatalogValue += songMonthly * inputs.frontCatalogMonthMultiplier;
  }

  // ══════════════════════════════════════════════════════
  // STEP 3 — BASE DEAL
  // ══════════════════════════════════════════════════════

  const baseOfferValue = backCatalogValue + frontCatalogValue;

  // ══════════════════════════════════════════════════════
  // STEP 4 — OPTIONS
  // Option 1 = Base × %, each next reduced by decay %
  // ══════════════════════════════════════════════════════

  const optionBase = inputs.optionBaseValue !== null && inputs.optionBaseValue >= 0
    ? inputs.optionBaseValue
    : frontCatalogValue;

  const clampedOptions = Math.min(Math.max(inputs.optionCount, 0), 4);
  const optionPctDecimal = Math.max(inputs.optionPct, 0) / 100;
  const optionDecayDecimal = Math.max(inputs.optionDecayPct, 0) / 100;

  const optionBreakdown: number[] = [];
  let totalOptionsValue = 0;
  for (let i = 0; i < clampedOptions; i++) {
    const decayFactor = Math.max(0, 1 - i * optionDecayDecimal);
    const optionVal = optionBase * optionPctDecimal * decayFactor;
    optionBreakdown.push(round(optionVal));
    totalOptionsValue += optionVal;
  }

  // ══════════════════════════════════════════════════════
  // STEP 5 — SUBTOTAL
  // ══════════════════════════════════════════════════════

  const subtotalBeforeModifiers = baseOfferValue + totalOptionsValue;

  // ══════════════════════════════════════════════════════
  // STEP 6 — EXCLUSIVITY MULTIPLIER
  // ══════════════════════════════════════════════════════

  let exclusivityMultiplier = 1.0;
  switch (inputs.exclusivityMonths) {
    case 3:  exclusivityMultiplier = f.exclusivity3mo; break;
    case 6:  exclusivityMultiplier = f.exclusivity6mo; break;
    case 12: exclusivityMultiplier = f.exclusivity12mo; break;
    case 18: exclusivityMultiplier = f.exclusivity18mo; break;
    case 24: exclusivityMultiplier = f.exclusivity24mo; break;
  }
  const postExclusivityValue = subtotalBeforeModifiers * exclusivityMultiplier;

  // ══════════════════════════════════════════════════════
  // STEP 7 — ARTIST ROYALTY ADJUSTMENT
  // ══════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════
  // STEP 8 — LICENSE PERIOD MULTIPLIER
  // ══════════════════════════════════════════════════════

  let licensePeriodMultiplier = 1.0;
  switch (inputs.licensePeriod) {
    case '6yr':       licensePeriodMultiplier = f.license6yr; break;
    case '12yr':      licensePeriodMultiplier = f.license12yr; break;
    case '20yr':      licensePeriodMultiplier = f.license20yr; break;
    case 'perpetuity': licensePeriodMultiplier = f.licensePerpetual; break;
  }
  const postLicenseValue = postRoyaltyValue * licensePeriodMultiplier;

  // ══════════════════════════════════════════════════════
  // STEP 9 — GOODWILL % MULTIPLIER
  // ══════════════════════════════════════════════════════

  const goodwillPct = Math.max(inputs.goodwillBonusPct || 0, 0);
  const goodwillMultiplier = 1 + goodwillPct / 100;
  const postGoodwillValue = postLicenseValue * goodwillMultiplier;
  const goodwillValue = postGoodwillValue - postLicenseValue;

  // ══════════════════════════════════════════════════════
  // STEP 10 — PUBLISHING (unchanged)
  // ══════════════════════════════════════════════════════

  let publishingValue = 0;
  if (inputs.publishing === 'admin25') {
    publishingValue = annualRevenue * f.publishingAdminPct;
  } else if (inputs.publishing === 'copub50') {
    publishingValue = annualRevenue * f.publishingAdminPct * f.publishingCopubMultiplier;
  }

  // ══════════════════════════════════════════════════════
  // STEP 10b — DEAL ADD-ONS (preserved from V1)
  // ══════════════════════════════════════════════════════

  const rofrBonus = inputs.rightOfFirstRefusal ? postGoodwillValue * f.rofrPct : 0;
  const upstreamingValue = inputs.upstreaming ? postGoodwillValue * f.upstreamingPct : 0;
  const ancillariesValue = inputs.ancillaries ? postGoodwillValue * f.ancillariesPct : 0;

  // ══════════════════════════════════════════════════════
  // STEP 11 — CONTENT BUDGET (unchanged)
  // ══════════════════════════════════════════════════════

  const contentShiftPct = Math.min(Math.max(inputs.contentBudgetPct, 0), 50) / 100;
  const contentBudget = postGoodwillValue * contentShiftPct;
  const contentBudgetBonus = contentBudget * f.contentBonusPct;

  // ══════════════════════════════════════════════════════
  // STEP 12 — CORE DEAL VALUE
  // ══════════════════════════════════════════════════════

  const coreDealValue = postGoodwillValue + publishingValue + rofrBonus + upstreamingValue + ancillariesValue + contentBudgetBonus;

  // ══════════════════════════════════════════════════════
  // STEP 13 — ALL UPFRONT DISCOUNT (preserved)
  // ══════════════════════════════════════════════════════

  const allUpfrontDiscount = inputs.allUpfront ? coreDealValue * f.allUpfrontDiscountPct : 0;
  const totalDealValue = coreDealValue - allUpfrontDiscount;

  // ══════════════════════════════════════════════════════
  // STEP 14 — BUDGET SPLIT & PAYMENT SCHEDULE (preserved)
  // ══════════════════════════════════════════════════════

  const advanceBudget = totalDealValue * f.advanceSplitPct;
  const marketingBudget = totalDealValue * (1 - f.advanceSplitPct);

  // Marketing Budget (NEW — % of total deal, separate from advance split)
  const mktPct = Math.min(
    Math.max(inputs.marketingBudgetPct || 0, f.marketingBudgetMinPct),
    f.marketingBudgetMaxPct
  ) / 100;
  const marketingBudgetValue = totalDealValue * mktPct;

  // Payment schedule
  const adjustedAdvance = advanceBudget - contentBudget;
  let signingPayment: number, backCatalogDeliveryPayment: number, halfSongsPayment: number, otherHalfPayment: number;
  if (inputs.allUpfront) {
    signingPayment = adjustedAdvance;
    backCatalogDeliveryPayment = 0;
    halfSongsPayment = 0;
    otherHalfPayment = 0;
  } else {
    signingPayment = adjustedAdvance * 0.25;
    backCatalogDeliveryPayment = adjustedAdvance * 0.25;
    halfSongsPayment = adjustedAdvance * 0.25;
    otherHalfPayment = adjustedAdvance * 0.25;
  }

  return {
    backCatalogValue: round(backCatalogValue),
    backCatalogSongsIncluded,
    frontCatalogValue: round(frontCatalogValue),
    suggestedFrontBaseValue: round(suggestedFrontBaseValue),
    baseOfferValue: round(baseOfferValue),
    optionBreakdown,
    totalOptionsValue: round(totalOptionsValue),
    subtotalBeforeModifiers: round(subtotalBeforeModifiers),
    exclusivityMultiplier,
    postExclusivityValue: round(postExclusivityValue),
    royaltyMultiplier,
    postRoyaltyValue: round(postRoyaltyValue),
    licensePeriodMultiplier,
    postLicenseValue: round(postLicenseValue),
    goodwillMultiplier,
    goodwillValue: round(goodwillValue),
    postGoodwillValue: round(postGoodwillValue),
    rofrBonus: round(rofrBonus),
    upstreamingValue: round(upstreamingValue),
    ancillariesValue: round(ancillariesValue),
    publishingValue: round(publishingValue),
    contentBudget: round(contentBudget),
    contentBudgetBonus: round(contentBudgetBonus),
    marketingBudgetValue: round(marketingBudgetValue),
    allUpfrontDiscount: round(allUpfrontDiscount),
    advanceBudget: round(advanceBudget),
    marketingBudget: round(marketingBudget),
    signingPayment: round(signingPayment),
    backCatalogDeliveryPayment: round(backCatalogDeliveryPayment),
    halfSongsPayment: round(halfSongsPayment),
    otherHalfPayment: round(otherHalfPayment),
    adjustedAdvance: round(adjustedAdvance),
    totalDealValue: round(totalDealValue),
    annualRevenue: round(annualRevenue),
    totalStreams,
    catalogMonths,
    cpm: Math.round(cpm * 100) / 100,
    songsInCatalog: totalSongs,
    avgMonthlyRevenuePerSong: round(avgMonthlyRevenuePerSong),
    filteredSongsCount,
    filteredMonthsCount: filteredMonthly.length,
    goodwillBonus: round(goodwillValue),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
