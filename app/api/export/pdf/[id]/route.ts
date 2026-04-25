import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { LuminateDataset } from '@/lib/types';
import { computeOverviewKPIs, computeSongAggregations, computeGrowthMetrics, computeDealInsights, defaultFilters } from '@/lib/analytics';
import { formatNumber, formatCurrency, formatPct } from '@/lib/utils';

// Reconstruct dataset from DB (same logic as artist detail API)
async function getArtistDataset(id: string): Promise<LuminateDataset | null> {
  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      report: true,
      weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] },
      releases: { include: { weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] } } },
      songs: { include: { weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] } } },
    },
  });
  if (!artist) return null;

  return {
    summary: {
      reportName: artist.name,
      reportGenerated: new Date().toISOString(),
      reportId: artist.report?.id || '',
      timeFrame: artist.report?.timeFrame || '',
      location: artist.report?.location || 'Worldwide',
      market: 'National',
      includedActivities: ['Streams'],
    },
    catalog: [
      { type: 'Artist', name: artist.name, artist: '-', releaseType: '-', releaseDate: null, mainGenre: artist.genre, luminateId: artist.luminateId || '' },
      ...artist.releases.map((r: any) => ({ type: 'Release Group' as const, name: r.title, artist: artist.name, releaseType: r.releaseType, releaseDate: r.releaseDate, mainGenre: '', luminateId: r.luminateId })),
      ...artist.songs.map((s: any) => ({ type: 'Song' as const, name: s.title, artist: artist.name, releaseType: '', releaseDate: null, mainGenre: '', luminateId: s.luminateId })),
    ],
    artistWeekly: artist.weekly.map((w: any) => ({ location: 'Worldwide', entity: 'Artist', artist: artist.name, luminateId: artist.luminateId || '', activity: 'Streams', week: w.week, year: w.year, dateRange: w.dateRange, quantity: w.quantity, ytd: w.ytd, atd: w.atd })),
    releaseGroupWeekly: artist.releases.flatMap((r: any) => r.weekly.map((w: any) => ({ location: 'Worldwide', entity: 'Release Group', artist: artist.name, title: r.title, luminateId: r.luminateId, activity: 'Streams', releaseType: r.releaseType, week: w.week, year: w.year, dateRange: w.dateRange, quantity: w.quantity, ytd: w.ytd, atd: w.atd }))),
    songWeekly: artist.songs.flatMap((s: any) => s.weekly.map((w: any) => ({ location: 'Worldwide', entity: 'Song', artist: artist.name, title: s.title, luminateId: s.luminateId, activity: 'Streams', week: w.week, year: w.year, dateRange: w.dateRange, quantity: w.quantity, ytd: w.ytd, atd: w.atd }))),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getArtistDataset(id);
    if (!data) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    if (!data.artistWeekly?.length) {
      return new NextResponse(`No streaming data available for export. Upload a Luminate report first.`, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const kpis = computeOverviewKPIs(data);
    const growth = computeGrowthMetrics(data);
    const deal = computeDealInsights(data, defaultFilters);
    const songs = computeSongAggregations(data, defaultFilters);

    // Generate CSV-like report (easily importable)
    const lines: string[] = [];
    lines.push('NEWWRLD DATAVERSE — ARTIST REPORT');
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`Artist: ${kpis.artistName}`);
    lines.push(`Genre: ${kpis.genre}`);
    lines.push(`Time Frame: ${kpis.timeFrame}`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push('KEY METRICS');
    lines.push('-'.repeat(50));
    lines.push(`All-Time Streams: ${formatNumber(kpis.totalATD)} (${kpis.totalATD.toLocaleString()})`);
    lines.push(`YTD Streams: ${formatNumber(kpis.ytdStreams)}`);
    lines.push(`Current Week: ${formatNumber(kpis.currentWeekStreams)}`);
    lines.push(`12W Average: ${formatNumber(kpis.trailingAvg12W)} / week`);
    lines.push(`Peak Week: ${formatNumber(kpis.peakWeekStreams)} (${kpis.peakWeekDate})`);
    lines.push(`Top Song: ${kpis.topSongTitle} (${formatNumber(kpis.topSongATD)} ATD)`);
    lines.push(`Total Songs: ${kpis.totalSongs}`);
    lines.push(`Total Releases: ${kpis.totalReleases}`);
    lines.push('');
    lines.push('GROWTH & MOMENTUM');
    lines.push('-'.repeat(50));
    lines.push(`WoW Growth: ${growth.wowGrowth > 0 ? '+' : ''}${growth.wowGrowth}%`);
    lines.push(`12W vs Prior 12W: ${growth.trailing12WvsP12 > 0 ? '+' : ''}${growth.trailing12WvsP12}%`);
    lines.push(`Stream Velocity: ${growth.streamVelocity}%`);
    lines.push(`YTD Pace (Annualized): ${formatNumber(growth.ytdPace)}`);
    lines.push(`Growth Classification: ${deal.growthClassification}`);
    lines.push('');
    lines.push('DEAL INTELLIGENCE');
    lines.push('-'.repeat(50));
    lines.push(`Estimated Annual Revenue: ${formatCurrency(deal.revenueEstimateLow)} – ${formatCurrency(deal.revenueEstimateHigh)}`);
    lines.push(`Estimated Annual Streams: ${formatNumber(deal.estimatedAnnualStreams)}`);
    lines.push(`Catalog Concentration (HHI): ${deal.catalogConcentrationIndex} (${deal.concentrationLabel})`);
    lines.push(`Top Song Share: ${formatPct(deal.topSongShare)}`);
    lines.push(`Top 3 Songs Share: ${formatPct(deal.top3SongShare)}`);
    lines.push(`Feature vs Own: ${formatPct(100 - deal.featureVsOwnPct)} own, ${formatPct(deal.featureVsOwnPct)} features`);
    lines.push('');
    lines.push('TOP 25 SONGS');
    lines.push('-'.repeat(50));
    lines.push('Rank | Song | Artist | ATD | YTD | This Week | Trend');
    songs.slice(0, 25).forEach((s, i) => {
      lines.push(`${i + 1} | ${s.title} | ${s.artist} | ${formatNumber(s.atd)} | ${formatNumber(s.ytd)} | ${formatNumber(s.currentWeek)} | ${s.trend} ${s.trendPct}%`);
    });
    lines.push('');
    lines.push('='.repeat(50));
    lines.push('Report generated by NEWWRLD Dataverse');

    const content = lines.join('\n');

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${kpis.artistName.replace(/[^a-zA-Z0-9]/g, '_')}_report.txt"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
