// ============================================================
// Luminate Data Types
// ============================================================

/** Metadata extracted from the Summary tab */
export interface ReportSummary {
  reportName: string;
  reportGenerated: string;
  reportId: string;
  timeFrame: string;
  location: string;
  market: string;
  includedActivities: string[];
}

/** An entry from the Items tab — catalog index */
export interface CatalogItem {
  type: 'Artist' | 'Release Group' | 'Song';
  name: string;
  artist: string;
  releaseType: string;
  releaseDate: string | null;
  mainGenre: string;
  luminateId: string;
}

/** A single weekly data point from the Artist tab */
export interface ArtistWeekly {
  location: string;
  entity: string;
  artist: string;
  luminateId: string;
  activity: string;
  week: number;
  year: number;
  dateRange: string;
  quantity: number;
  ytd: number | null;
  atd: number | null;
}

/** A single weekly data point from the Release Group tab */
export interface ReleaseGroupWeekly {
  location: string;
  entity: string;
  artist: string;
  title: string;
  luminateId: string;
  activity: string;
  releaseType: string;
  week: number;
  year: number;
  dateRange: string;
  quantity: number;
  ytd: number | null;
  atd: number | null;
}

/** A single weekly data point from the Song tab */
export interface SongWeekly {
  location: string;
  entity: string;
  artist: string;
  title: string;
  luminateId: string;
  activity: string;
  week: number;
  year: number;
  dateRange: string;
  quantity: number;
  ytd: number | null;
  atd: number | null;
}

// ============================================================
// Parsed Data Container
// ============================================================

/** The entire parsed dataset from one .xlsx file */
export interface LuminateDataset {
  summary: ReportSummary;
  catalog: CatalogItem[];
  artistWeekly: ArtistWeekly[];
  releaseGroupWeekly: ReleaseGroupWeekly[];
  songWeekly: SongWeekly[];
}

// ============================================================
// Analytics / Aggregated Types
// ============================================================

/** Overview KPI metrics */
export interface OverviewKPIs {
  totalATD: number;
  ytdStreams: number;
  currentWeekStreams: number;
  trailingAvg12W: number;
  totalSongs: number;
  totalReleases: number;
  topSongTitle: string;
  topSongATD: number;
  peakWeekStreams: number;
  peakWeekDate: string;
  artistName: string;
  genre: string;
  timeFrame: string;
}

/** Aggregated release group stats */
export interface ReleaseGroupAggregated {
  title: string;
  artist: string;
  releaseType: string;
  releaseDate: string | null;
  luminateId: string;
  atd: number;
  ytd: number;
  currentWeek: number;
  pctOfCatalog: number;
  avgWeeklyStreams: number;
  decayRate: number;
  sparklineData: number[];
  weeklyData: { date: string; quantity: number }[];
}

/** Aggregated song stats */
export interface SongAggregated {
  title: string;
  artist: string;
  luminateId: string;
  atd: number;
  ytd: number;
  currentWeek: number;
  peakWeek: number;
  peakWeekDate: string;
  weeksActive: number;
  velocity: number;
  trend: 'up' | 'down' | 'flat';
  trendPct: number;
  weeklyData: { date: string; quantity: number }[];
  sparklineData: number[];
}

/** Growth and momentum metrics */
export interface GrowthMetrics {
  wowGrowth: number;
  rollingAvg4W: number;
  rollingAvg12W: number;
  trailing12WvsP12: number;
  streamVelocity: number;
  ytdPace: number;
  weeklyTrend: { date: string; quantity: number; ma4: number; ma12: number }[];
}

/** Deal intelligence metrics */
export interface DealInsights {
  estimatedAnnualStreams: number;
  catalogConcentrationIndex: number;
  concentrationLabel: string;
  featureVsOwnPct: number;
  growthClassification: 'Accelerating' | 'Stable' | 'Declining';
  breakoutSongs: { title: string; artist: string; growthRate: number }[];
  revenueEstimateLow: number;
  revenueEstimateHigh: number;
  topSongShare: number;
  top3SongShare: number;
  top5SongShare: number;
  effectiveCpm: number | null;  // derived from actual earnings data
  revenueFromActuals: number | null;  // annual projection from real data
}

/** Catalog composition data */
export interface CatalogComposition {
  byRelease: { name: string; value: number; pct: number; releaseType: string }[];
  bySong: { name: string; value: number; pct: number }[];
  singleVsAlbum: { singles: number; albums: number };
  featureVsOwn: { feature: number; own: number };
  concentrationData: { label: string; value: number }[];
}

/** Actual monthly earnings entry */
export interface MonthlyEarning {
  month: string;  // YYYY-MM format
  amount: number; // actual dollar amount earned
}

/** Filter state */
export interface FilterState {
  dateRange: [string, string] | null;
  releaseType: 'All' | 'Single' | 'Album';
  artistFilter: 'all' | 'primary' | 'features';
  minStreams: number;
  cpmLow: number;   // Cost Per Mille ($ per 1,000 streams)
  cpmHigh: number;
  actualEarnings: MonthlyEarning[];
}

// ============================================================
// DistroKid Data Types
// ============================================================

/** A single row from a DistroKid "excruciating details" CSV */
export interface DistroKidEntry {
  reportingDate: string;
  saleMonth: string;       // "2025-01" format
  store: string;
  artist: string;
  title: string;
  isrc: string;
  upc: string;
  quantity: number;
  teamPercentage: number;
  sourceType: string;
  country: string;
  songwriterRoyaltiesWithheld: number;
  earnings: number;        // USD
}

/** Aggregated DistroKid dataset */
export interface DistroKidDataset {
  totalEarnings: number;
  totalStreams: number;
  dateRange: [string, string];   // earliest/latest sale month
  artistName: string;
  monthlyRevenue: {
    month: string;
    earnings: number;
    streams: number;
    effectiveCpm: number;
  }[];
  platformBreakdown: {
    store: string;
    earnings: number;
    streams: number;
    cpm: number;
    pct: number;
  }[];
  songEarnings: {
    title: string;
    artist: string;
    isrc: string;
    earnings: number;
    streams: number;
    cpm: number;
  }[];
  countryBreakdown: {
    country: string;
    earnings: number;
    streams: number;
  }[];
}
