import type {
  LuminateDataset,
  OverviewKPIs,
  ReleaseGroupAggregated,
  SongAggregated,
  GrowthMetrics,
  DealInsights,
  CatalogComposition,
  FilterState,
} from './types';

// ============================================================
// Sort weekly data chronologically (oldest → newest)
// ============================================================

function sortByDate<T extends { dateRange: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const dateA = a.dateRange.split(' - ')[0] ?? '';
    const dateB = b.dateRange.split(' - ')[0] ?? '';
    return dateA.localeCompare(dateB);
  });
}

function getStartDate(dateRange: string): string {
  return dateRange.split(' - ')[0]?.replace(/\//g, '-') ?? '';
}

// ============================================================
// Overview KPIs
// ============================================================

export function computeOverviewKPIs(data: LuminateDataset): OverviewKPIs {
  const sorted = sortByDate(data.artistWeekly);
  const mostRecent = sorted[sorted.length - 1];

  const totalATD = mostRecent?.atd ?? sorted.reduce((sum, r) => sum + r.quantity, 0);
  const ytdStreams = mostRecent?.ytd ?? 0;
  const currentWeekStreams = mostRecent?.quantity ?? 0;

  // Trailing 12-week average
  const last12 = sorted.slice(-12);
  const trailingAvg12W = last12.length > 0
    ? last12.reduce((s, r) => s + r.quantity, 0) / last12.length
    : 0;

  // Total unique songs and releases
  const totalSongs = data.catalog.filter((c) => c.type === 'Song').length;
  const totalReleases = data.catalog.filter((c) => c.type === 'Release Group').length;

  // Top song by ATD
  const songsByATD = getTopSongsByATD(data);
  const topSong = songsByATD[0];

  // Peak week
  const peakRow = sorted.length > 0
    ? sorted.reduce((best, r) => (r.quantity > best.quantity ? r : best), sorted[0])
    : null;

  // Artist info from catalog
  const artistItem = data.catalog.find((c) => c.type === 'Artist');

  return {
    totalATD,
    ytdStreams,
    currentWeekStreams,
    trailingAvg12W: Math.round(trailingAvg12W),
    totalSongs,
    totalReleases,
    topSongTitle: topSong?.title ?? 'N/A',
    topSongATD: topSong?.atd ?? 0,
    peakWeekStreams: peakRow?.quantity ?? 0,
    peakWeekDate: peakRow?.dateRange ?? '',
    artistName: data.summary.reportName || artistItem?.name || 'Unknown',
    genre: artistItem?.mainGenre || '',
    timeFrame: data.summary.timeFrame,
  };
}

// ============================================================
// Song Aggregation
// ============================================================

function getTopSongsByATD(data: LuminateDataset): { title: string; artist: string; atd: number }[] {
  const songMap = new Map<string, { title: string; artist: string; atd: number }>();

  for (const row of data.songWeekly) {
    const key = row.luminateId || `${row.title}__${row.artist}`;
    const existing = songMap.get(key);
    if (!existing) {
      songMap.set(key, {
        title: row.title,
        artist: row.artist,
        atd: row.atd ?? 0,
      });
    } else {
      // ATD only appears on most recent row, take the max
      if (row.atd && row.atd > existing.atd) {
        existing.atd = row.atd;
      }
    }
  }

  return Array.from(songMap.values()).sort((a, b) => b.atd - a.atd);
}

export function computeSongAggregations(
  data: LuminateDataset,
  filters: FilterState
): SongAggregated[] {
  // Group by luminate ID
  const groups = new Map<string, typeof data.songWeekly>();

  for (const row of data.songWeekly) {
    const key = row.luminateId || `${row.title}__${row.artist}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const results: SongAggregated[] = [];

  for (const [, rows] of groups) {
    const sorted = sortByDate(rows);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const atd = last.atd ?? sorted.reduce((s, r) => s + r.quantity, 0);
    const ytd = last.ytd ?? 0;

    // Apply min streams filter
    if (atd < filters.minStreams) continue;

    // Apply artist filter
    if (filters.artistFilter === 'primary') {
      const primaryArtist = data.summary.reportName.toLowerCase();
      if (!first.artist.toLowerCase().includes(primaryArtist)) continue;
    }

    const currentWeek = last.quantity;
    const peakRow = sorted.reduce((best, r) => (r.quantity > best.quantity ? r : best), sorted[0]);

    // Velocity: last 4W avg / ATD * 52 (annualized share)
    const last4 = sorted.slice(-4);
    const avg4W = last4.reduce((s, r) => s + r.quantity, 0) / Math.max(last4.length, 1);
    const velocity = atd > 0 ? (avg4W * 52) / atd * 100 : 0;

    // Trend: compare last 4W avg vs prior 4W avg
    const prior4 = sorted.slice(-8, -4);
    const avgPrior4W = prior4.length > 0
      ? prior4.reduce((s, r) => s + r.quantity, 0) / prior4.length
      : avg4W;
    const trendPct = avgPrior4W > 0 ? ((avg4W - avgPrior4W) / avgPrior4W) * 100 : 0;
    const trend: 'up' | 'down' | 'flat' = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'flat';

    const weeklyData = sorted.map((r) => ({
      date: getStartDate(r.dateRange),
      quantity: r.quantity,
    }));

    const sparklineData = sorted.slice(-12).map((r) => r.quantity);

    results.push({
      title: first.title,
      artist: first.artist,
      luminateId: first.luminateId,
      atd,
      ytd,
      currentWeek,
      peakWeek: peakRow.quantity,
      peakWeekDate: peakRow.dateRange,
      weeksActive: sorted.length,
      velocity: Math.round(velocity * 10) / 10,
      trend,
      trendPct: Math.round(trendPct * 10) / 10,
      weeklyData,
      sparklineData,
    });
  }

  return results.sort((a, b) => b.atd - a.atd);
}

// ============================================================
// Release Group Aggregation
// ============================================================

export function computeReleaseGroupAggregations(
  data: LuminateDataset,
  filters: FilterState
): ReleaseGroupAggregated[] {
  const groups = new Map<string, typeof data.releaseGroupWeekly>();

  for (const row of data.releaseGroupWeekly) {
    const key = row.luminateId || `${row.title}__${row.artist}`;

    // Apply release type filter
    if (filters.releaseType !== 'All' && row.releaseType !== filters.releaseType) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const artistATD = computeOverviewKPIs(data).totalATD;
  const results: ReleaseGroupAggregated[] = [];

  for (const [, rows] of groups) {
    const sorted = sortByDate(rows);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const atd = last.atd ?? sorted.reduce((s, r) => s + r.quantity, 0);
    const ytd = last.ytd ?? 0;

    if (atd < filters.minStreams) continue;

    const currentWeek = last.quantity;
    const pctOfCatalog = artistATD > 0 ? (atd / artistATD) * 100 : 0;
    const avgWeeklyStreams = sorted.length > 0 ? atd / sorted.length : 0;

    // Decay rate: compare last 4W avg vs prior 4W avg
    const last4 = sorted.slice(-4);
    const prior4 = sorted.slice(-8, -4);
    const avgLast4 = last4.reduce((s, r) => s + r.quantity, 0) / Math.max(last4.length, 1);
    const avgPrior4 = prior4.length > 0
      ? prior4.reduce((s, r) => s + r.quantity, 0) / prior4.length
      : avgLast4;
    const decayRate = avgPrior4 > 0 ? ((avgLast4 - avgPrior4) / avgPrior4) * 100 : 0;

    const sparklineData = sorted.slice(-12).map((r) => r.quantity);
    const weeklyData = sorted.map((r) => ({
      date: getStartDate(r.dateRange),
      quantity: r.quantity,
    }));

    // Get release date from catalog
    const catalogItem = data.catalog.find(
      (c) => c.type === 'Release Group' && c.luminateId === first.luminateId
    );

    results.push({
      title: first.title,
      artist: first.artist,
      releaseType: first.releaseType,
      releaseDate: catalogItem?.releaseDate ?? null,
      luminateId: first.luminateId,
      atd,
      ytd,
      currentWeek,
      pctOfCatalog: Math.round(pctOfCatalog * 10) / 10,
      avgWeeklyStreams: Math.round(avgWeeklyStreams),
      decayRate: Math.round(decayRate * 10) / 10,
      sparklineData,
      weeklyData,
    });
  }

  return results.sort((a, b) => b.atd - a.atd);
}

// ============================================================
// Growth Metrics
// ============================================================

export function computeGrowthMetrics(data: LuminateDataset): GrowthMetrics {
  const sorted = sortByDate(data.artistWeekly);

  const quantities = sorted.map((r) => r.quantity);
  const n = quantities.length;

  const currentWeek = quantities[n - 1] ?? 0;
  const lastWeek = quantities[n - 2] ?? 0;
  const wowGrowth = lastWeek > 0 ? ((currentWeek - lastWeek) / lastWeek) * 100 : 0;

  // Rolling averages
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const rollingAvg4W = avg(quantities.slice(-4));
  const rollingAvg12W = avg(quantities.slice(-12));

  // Trailing 12W vs prior 12W
  const trailing12 = avg(quantities.slice(-12));
  const prior12 = avg(quantities.slice(-24, -12));
  const trailing12WvsP12 = prior12 > 0 ? ((trailing12 - prior12) / prior12) * 100 : 0;

  // Stream velocity: annualized recent activity as % of ATD
  const mostRecent = sorted[sorted.length - 1];
  const atd = mostRecent?.atd ?? quantities.reduce((s, v) => s + v, 0);
  const streamVelocity = atd > 0 ? (rollingAvg4W * 52) / atd * 100 : 0;

  // YTD pace
  const ytd = mostRecent?.ytd ?? 0;
  const currentYear = mostRecent?.year ?? new Date().getFullYear();
  const weeksIntoYear = sorted.filter((r) => r.year === currentYear).length;
  const ytdPace = weeksIntoYear > 0 ? (ytd / weeksIntoYear) * 52 : 0;

  // Weekly trend with moving averages
  const weeklyTrend = sorted.map((r, i) => {
    const ma4Slice = quantities.slice(Math.max(0, i - 3), i + 1);
    const ma12Slice = quantities.slice(Math.max(0, i - 11), i + 1);
    return {
      date: getStartDate(r.dateRange),
      quantity: r.quantity,
      ma4: Math.round(avg(ma4Slice)),
      ma12: Math.round(avg(ma12Slice)),
    };
  });

  return {
    wowGrowth: Math.round(wowGrowth * 10) / 10,
    rollingAvg4W: Math.round(rollingAvg4W),
    rollingAvg12W: Math.round(rollingAvg12W),
    trailing12WvsP12: Math.round(trailing12WvsP12 * 10) / 10,
    streamVelocity: Math.round(streamVelocity * 10) / 10,
    ytdPace: Math.round(ytdPace),
    weeklyTrend,
  };
}

// ============================================================
// Deal Insights
// ============================================================

export function computeDealInsights(
  data: LuminateDataset,
  filters: FilterState
): DealInsights {
  const sorted = sortByDate(data.artistWeekly);
  const songs = computeSongAggregations(data, { ...filters, minStreams: 0 });

  // Estimated annual streams (trailing 12W avg × 52)
  const last12 = sorted.slice(-12);
  const avg12 = last12.reduce((s, r) => s + r.quantity, 0) / Math.max(last12.length, 1);
  const estimatedAnnualStreams = Math.round(avg12 * 52);

  // Herfindahl index for catalog concentration
  const totalATD = songs.reduce((s, sg) => s + sg.atd, 0);
  const hhi = totalATD > 0
    ? songs.reduce((s, sg) => s + Math.pow(sg.atd / totalATD, 2), 0)
    : 0;
  const catalogConcentrationIndex = Math.round(hhi * 10000); // 0-10000 scale
  const concentrationLabel =
    catalogConcentrationIndex > 2500
      ? 'High Concentration'
      : catalogConcentrationIndex > 1500
        ? 'Moderate Concentration'
        : 'Diversified';

  // Feature vs own — detect from song titles
  const primaryArtist = data.summary.reportName.toLowerCase().trim();

  let featureStreams = 0;
  let ownStreams = 0;
  for (const song of songs) {
    const titleLower = song.title.toLowerCase();
    const featurePatterns = [
      / \+ /,  / feat[\. ]/, / ft[\. ]/, / featuring /, / with /, / & /,
    ];
    const isFeature = featurePatterns.some(p => p.test(titleLower));
    
    if (isFeature) {
      featureStreams += song.atd;
    } else {
      ownStreams += song.atd;
    }
  }
  const totalS = featureStreams + ownStreams;
  const featureVsOwnPct = totalS > 0 ? (featureStreams / totalS) * 100 : 0;

  // Growth classification
  const trailing12WvsP12 = computeGrowthMetrics(data).trailing12WvsP12;
  const growthClassification: DealInsights['growthClassification'] =
    trailing12WvsP12 > 10 ? 'Accelerating' : trailing12WvsP12 < -10 ? 'Declining' : 'Stable';

  // Breakout detection: songs growing >50% WoW for 3+ consecutive weeks
  const breakoutSongs: DealInsights['breakoutSongs'] = [];
  for (const song of songs) {
    if (song.weeklyData.length < 4) continue;
    const recent = song.weeklyData.slice(-6);
    let consecutiveGrowth = 0;
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1].quantity;
      const curr = recent[i].quantity;
      if (prev > 0 && (curr - prev) / prev > 0.5) {
        consecutiveGrowth++;
      } else {
        consecutiveGrowth = 0;
      }
    }
    if (consecutiveGrowth >= 3) {
      breakoutSongs.push({
        title: song.title,
        artist: song.artist,
        growthRate: song.trendPct,
      });
    }
  }

  // Revenue estimates using CPM (cost per mille = $ per 1000 streams)
  const mostRecent = sorted[sorted.length - 1];
  const atd = mostRecent?.atd ?? sorted.reduce((s, r) => s + r.quantity, 0);
  const revenueEstimateLow = (estimatedAnnualStreams / 1000) * filters.cpmLow;
  const revenueEstimateHigh = (estimatedAnnualStreams / 1000) * filters.cpmHigh;

  // Calculate effective CPM from actual monthly earnings
  let effectiveCpm: number | null = null;
  let revenueFromActuals: number | null = null;
  if (filters.actualEarnings.length > 0) {
    // For each month with earnings, find the corresponding streams
    let totalEarnings = 0;
    let totalStreamsForEarningMonths = 0;

    for (const entry of filters.actualEarnings) {
      if (entry.amount <= 0) continue;
      totalEarnings += entry.amount;
      // Find streams for this month from artist weekly data
      const [yearStr, monthStr] = entry.month.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const monthStreams = sorted
        .filter((r) => {
          const dateStart = r.dateRange.split(' - ')[0] ?? '';
          const parts = dateStart.split('/');
          if (parts.length >= 2) {
            const rYear = parseInt(parts[0]);
            const rMonth = parseInt(parts[1]);
            return rYear === year && rMonth === month;
          }
          return false;
        })
        .reduce((s, r) => s + r.quantity, 0);
      totalStreamsForEarningMonths += monthStreams;
    }

    if (totalStreamsForEarningMonths > 0 && totalEarnings > 0) {
      effectiveCpm = (totalEarnings / totalStreamsForEarningMonths) * 1000;
      // Project annual revenue using the effective CPM
      revenueFromActuals = (estimatedAnnualStreams / 1000) * effectiveCpm;
    }
  }

  // Top song concentration
  const sortedSongs = [...songs].sort((a, b) => b.atd - a.atd);
  const topSongShare = totalATD > 0 ? (sortedSongs[0]?.atd ?? 0) / totalATD * 100 : 0;
  const top3Sum = sortedSongs.slice(0, 3).reduce((s, sg) => s + sg.atd, 0);
  const top3SongShare = totalATD > 0 ? top3Sum / totalATD * 100 : 0;
  const top5Sum = sortedSongs.slice(0, 5).reduce((s, sg) => s + sg.atd, 0);
  const top5SongShare = totalATD > 0 ? top5Sum / totalATD * 100 : 0;

  return {
    estimatedAnnualStreams,
    catalogConcentrationIndex,
    concentrationLabel,
    featureVsOwnPct: Math.round(featureVsOwnPct * 10) / 10,
    growthClassification,
    breakoutSongs,
    revenueEstimateLow: Math.round(revenueEstimateLow),
    revenueEstimateHigh: Math.round(revenueEstimateHigh),
    topSongShare: Math.round(topSongShare * 10) / 10,
    top3SongShare: Math.round(top3SongShare * 10) / 10,
    top5SongShare: Math.round(top5SongShare * 10) / 10,
    effectiveCpm: effectiveCpm !== null ? Math.round(effectiveCpm * 100) / 100 : null,
    revenueFromActuals: revenueFromActuals !== null ? Math.round(revenueFromActuals) : null,
  };
}

// ============================================================
// Catalog Composition
// ============================================================

export function computeCatalogComposition(
  data: LuminateDataset,
  filters: FilterState
): CatalogComposition {
  const songs = computeSongAggregations(data, { ...filters, minStreams: 0 });
  const releases = computeReleaseGroupAggregations(data, { ...filters, minStreams: 0 });

  const totalSongATD = songs.reduce((s, sg) => s + sg.atd, 0);
  const totalReleaseATD = releases.reduce((s, r) => s + r.atd, 0);

  const byRelease = releases.map((r) => ({
    name: r.title,
    value: r.atd,
    pct: totalReleaseATD > 0 ? Math.round((r.atd / totalReleaseATD) * 1000) / 10 : 0,
    releaseType: r.releaseType,
  }));

  const bySong = songs.slice(0, 20).map((s) => ({
    name: s.title,
    value: s.atd,
    pct: totalSongATD > 0 ? Math.round((s.atd / totalSongATD) * 1000) / 10 : 0,
  }));

  // Singles vs albums split
  const singlesATD = releases
    .filter((r) => r.releaseType === 'Single')
    .reduce((s, r) => s + r.atd, 0);
  const albumsATD = releases
    .filter((r) => r.releaseType === 'Album')
    .reduce((s, r) => s + r.atd, 0);

  // Feature vs own — detect from song titles
  // Luminate's Artist column always shows the report's primary artist,
  // so we parse song titles for collaboration indicators instead.
  // Common patterns: "Artist1 + Artist2 - Song", "Song (feat. Artist2)", 
  // "Artist1 & Artist2 - Song", "Song ft. Artist2"
  const primaryArtist = data.summary.reportName.toLowerCase().trim();

  let featureATD = 0;
  let ownATD = 0;
  for (const song of songs) {
    const titleLower = song.title.toLowerCase();
    
    // Check title for collaboration indicators
    const featurePatterns = [
      / \+ /,           // "artist1 + artist2 - song"
      / feat[\. ]/,     // "song feat. artist" or "song feat artist"
      / ft[\. ]/,       // "song ft. artist" or "song ft artist"  
      / featuring /,    // "song featuring artist"
      / with /,         // "song with artist"
      / & /,            // "artist1 & artist2 - song"
    ];
    const isFeature = featurePatterns.some(p => p.test(titleLower));
    
    if (isFeature) {
      featureATD += song.atd;
    } else {
      ownATD += song.atd;
    }
  }

  // Concentration data for visualization
  const sorted = [...songs].sort((a, b) => b.atd - a.atd);
  const concentrationData = [
    { label: 'Top 1', value: totalSongATD > 0 ? (sorted[0]?.atd ?? 0) / totalSongATD * 100 : 0 },
    { label: 'Top 3', value: totalSongATD > 0 ? sorted.slice(0, 3).reduce((s, sg) => s + sg.atd, 0) / totalSongATD * 100 : 0 },
    { label: 'Top 5', value: totalSongATD > 0 ? sorted.slice(0, 5).reduce((s, sg) => s + sg.atd, 0) / totalSongATD * 100 : 0 },
    { label: 'Top 10', value: totalSongATD > 0 ? sorted.slice(0, 10).reduce((s, sg) => s + sg.atd, 0) / totalSongATD * 100 : 0 },
    { label: 'All Others', value: 100 },
  ];

  return {
    byRelease,
    bySong,
    singleVsAlbum: { singles: singlesATD, albums: albumsATD },
    featureVsOwn: { feature: featureATD, own: ownATD },
    concentrationData,
  };
}

// ============================================================
// Artist Timeline Data (for the main chart)
// ============================================================

export function computeArtistTimeline(
  data: LuminateDataset
): { date: string; quantity: number; dateRange: string }[] {
  const sorted = sortByDate(data.artistWeekly);
  return sorted.map((r) => ({
    date: getStartDate(r.dateRange),
    quantity: r.quantity,
    dateRange: r.dateRange,
  }));
}

// ============================================================
// Default filter state
// ============================================================

export const defaultFilters: FilterState = {
  dateRange: null,
  releaseType: 'All',
  artistFilter: 'all',
  minStreams: 0,
  cpmLow: 3.0,    // $3.00 CPM (= $0.003 per stream)
  cpmHigh: 5.0,   // $5.00 CPM (= $0.005 per stream)
  actualEarnings: [],
};
