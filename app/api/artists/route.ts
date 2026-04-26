import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return ALL artists (shared across users — deduplication by name/luminateId)
    const artists = await prisma.artist.findMany({
      include: {
        weekly: {
          orderBy: [{ year: 'desc' }, { week: 'desc' }],
          take: 12,
        },
        _count: {
          select: {
            songs: true,
            releases: true,
            distrokidData: true,
            weekly: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch leads separately — graceful if SongcashLead table doesn't exist yet
    let leadsByArtist = new Map<string, { id: string; name: string; email: string; status: string; createdAt: string }>();
    try {
      const leads = await (prisma as any).songcashLead.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, artistId: true, name: true, email: true, status: true, createdAt: true },
      });
      for (const lead of leads) {
        if (!leadsByArtist.has(lead.artistId)) {
          leadsByArtist.set(lead.artistId, lead);
        }
      }
    } catch { /* SongcashLead table may not exist yet — that's OK */ }

    // Batch-query geo data: which artists have non-Worldwide weekly entries?
    const geoArtists = await prisma.artistWeekly.groupBy({
      by: ['artistId'],
      where: { location: { not: 'Worldwide' } },
    });
    const geoSet = new Set(geoArtists.map((g) => g.artistId));

    // Batch-query DK aggregate stats for all artists with DK data
    const dkArtistIds = artists.filter((a: any) => a._count.distrokidData > 0).map((a: any) => a.id);
    const dkAggregates = dkArtistIds.length > 0
      ? await prisma.distroKidMonthly.groupBy({
          by: ['artistId'],
          where: { artistId: { in: dkArtistIds } },
          _sum: { quantity: true, earnings: true },
          _count: { _all: true },
        })
      : [];
    const dkMap = new Map(dkAggregates.map((d: any) => [d.artistId, {
      totalStreams: d._sum.quantity || 0,
      totalEarnings: d._sum.earnings || 0,
      rowCount: d._count._all || 0,
    }]));

    // Batch-query DK song counts (unique titles per artist)
    const dkSongCounts = dkArtistIds.length > 0
      ? await prisma.distroKidMonthly.groupBy({
          by: ['artistId', 'title'],
          where: { artistId: { in: dkArtistIds } },
        })
      : [];
    const dkSongMap = new Map<string, number>();
    for (const entry of dkSongCounts) {
      dkSongMap.set(entry.artistId, (dkSongMap.get(entry.artistId) || 0) + 1);
    }

    const result = artists.map((artist: any) => {
      const sorted = [...artist.weekly].sort((a: any, b: any) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.week - b.week;
      });
      const mostRecent = sorted[sorted.length - 1];
      const prior = sorted[sorted.length - 2];

      // Luminate stats (if available)
      const luminateAtd = mostRecent?.atd ?? sorted.reduce((s: number, w: any) => s + w.quantity, 0);
      const luminateCurrentWeek = mostRecent?.quantity ?? 0;
      const wowChange = prior && prior.quantity > 0
        ? ((luminateCurrentWeek - prior.quantity) / prior.quantity) * 100
        : 0;

      // DK stats (if available)
      const dk = dkMap.get(artist.id);
      const dkSongs = dkSongMap.get(artist.id) || 0;

      // Use DK streams as fallback when no Luminate data exists
      const hasLuminate = sorted.length > 0;
      const atd = hasLuminate ? luminateAtd : (dk?.totalStreams ?? 0);
      const currentWeek = hasLuminate ? luminateCurrentWeek : 0;
      const totalEarnings = dk?.totalEarnings ?? 0;

      const avg12 = sorted.length > 0
        ? sorted.reduce((s: number, w: any) => s + w.quantity, 0) / sorted.length
        : 0;

      const sparkline = sorted.map((w: any) => w.quantity);

      // Song/release counts: use Luminate if available, fall back to DK
      const songCount = artist._count.songs > 0 ? artist._count.songs : dkSongs;
      const releaseCount = artist._count.releases;

      // Compute data completeness from ACTUAL data, not upload records
      // hasQBR: artist has song-level or release-level data (QBR reports include these)
      const hasQBR = artist._count.songs > 0 || artist._count.releases > 0;
      // hasTrends: artist has substantial weekly timeline data (50+ weeks = Trends report)
      const hasTrends = artist._count.weekly >= 50;
      // hasGeo: artist has non-Worldwide location data in weekly entries
      const hasGeo = geoSet.has(artist.id);
      // hasDK: has DistroKid revenue data
      const hasDK = artist._count.distrokidData > 0;
      // hasWeekly: has ANY weekly data at all
      const hasWeekly = artist._count.weekly > 0;

      return {
        id: artist.id,
        name: artist.name,
        genre: artist.genre,
        luminateId: artist.luminateId,
        atd,
        ytd: mostRecent?.ytd ?? 0,
        currentWeek,
        wowChange: Math.round(wowChange * 10) / 10,
        avg12w: Math.round(avg12),
        songCount,
        releaseCount,
        distrokidCount: artist._count.distrokidData,
        totalEarnings,
        sparkline,
        lastUpdated: mostRecent?.dateRange ?? '',
        luminateUploadedAt: artist.luminateUploadedAt,
        distrokidUploadedAt: artist.distrokidUploadedAt,
        createdAt: artist.createdAt,
        pipelineStage: artist.pipelineStage || 'research',
        hasQBR,
        hasTrends,
        hasGeo,
        hasDK,
        hasWeekly,
        hasLuminate,
        source: (artist as any).source || 'internal',
        leadId: leadsByArtist.get(artist.id)?.id || null,
        leadContact: leadsByArtist.get(artist.id) || null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Artists list error:', error);
    return NextResponse.json({ error: 'Failed to load artists' }, { status: 500 });
  }
}
