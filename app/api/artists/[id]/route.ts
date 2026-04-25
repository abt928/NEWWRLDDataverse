import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { LuminateDataset, CatalogItem, ArtistWeekly, ReleaseGroupWeekly, SongWeekly, DistroKidDataset } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        report: true,
        weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] },
        releases: {
          include: {
            weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] },
          },
        },
        songs: {
          include: {
            weekly: { orderBy: [{ year: 'asc' }, { week: 'asc' }] },
          },
        },
        distrokidData: true,
      },
    });

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Build Luminate dataset (if weekly data exists)
    const hasLuminate = artist.weekly.length > 0;

    const catalog: CatalogItem[] = [
      {
        type: 'Artist',
        name: artist.name,
        artist: '-',
        releaseType: '-',
        releaseDate: null,
        mainGenre: artist.genre,
        luminateId: artist.luminateId || '',
      },
      ...artist.releases.map((r: any) => ({
        type: 'Release Group' as const,
        name: r.title,
        artist: artist.name,
        releaseType: r.releaseType,
        releaseDate: r.releaseDate,
        mainGenre: '',
        luminateId: r.luminateId,
      })),
      ...artist.songs.map((s: any) => ({
        type: 'Song' as const,
        name: s.title,
        artist: artist.name,
        releaseType: '',
        releaseDate: null,
        mainGenre: '',
        luminateId: s.luminateId || '',
      })),
    ];

    const artistWeekly: ArtistWeekly[] = artist.weekly.map((w: any) => ({
      location: 'Worldwide',
      entity: 'Artist',
      artist: artist.name,
      luminateId: artist.luminateId || '',
      activity: 'Streams',
      week: w.week,
      year: w.year,
      dateRange: w.dateRange,
      quantity: w.quantity,
      ytd: w.ytd,
      atd: w.atd,
    }));

    const releaseGroupWeekly: ReleaseGroupWeekly[] = artist.releases.flatMap((r: any) =>
      r.weekly.map((w: any) => ({
        location: 'Worldwide',
        entity: 'Release Group',
        artist: artist.name,
        title: r.title,
        luminateId: r.luminateId,
        activity: 'Streams',
        releaseType: r.releaseType,
        week: w.week,
        year: w.year,
        dateRange: w.dateRange,
        quantity: w.quantity,
        ytd: w.ytd,
        atd: w.atd,
      }))
    );

    const songWeekly: SongWeekly[] = artist.songs.flatMap((s: any) =>
      s.weekly.map((w: any) => ({
        location: 'Worldwide',
        entity: 'Song',
        artist: artist.name,
        title: s.title,
        luminateId: s.luminateId,
        activity: 'Streams',
        week: w.week,
        year: w.year,
        dateRange: w.dateRange,
        quantity: w.quantity,
        ytd: w.ytd,
        atd: w.atd,
      }))
    );

    const luminate: LuminateDataset | null = hasLuminate ? {
      summary: {
        reportName: artist.name,
        reportGenerated: '',
        reportId: artist.report?.id || '',
        timeFrame: artist.report?.timeFrame || '',
        location: artist.report?.location || 'Worldwide',
        market: 'National',
        includedActivities: ['Streams'],
      },
      catalog,
      artistWeekly,
      releaseGroupWeekly,
      songWeekly,
    } : null;

    // Build DistroKid dataset (if dk data exists)
    const hasDistroKid = artist.distrokidData.length > 0;
    let distrokid: DistroKidDataset | null = null;

    if (hasDistroKid) {
      const dkEntries = artist.distrokidData;

      // Aggregate by month
      const monthMap = new Map<string, { earnings: number; streams: number }>();
      const storeMap = new Map<string, { earnings: number; streams: number }>();
      const songMap = new Map<string, { title: string; artist: string; isrc: string; earnings: number; streams: number }>();
      const countryMap = new Map<string, { earnings: number; streams: number }>();

      let totalEarnings = 0;
      let totalStreams = 0;
      let minMonth = 'zzzz';
      let maxMonth = '';

      for (const e of dkEntries) {
        totalEarnings += e.earnings;
        totalStreams += e.quantity;
        if (e.saleMonth < minMonth) minMonth = e.saleMonth;
        if (e.saleMonth > maxMonth) maxMonth = e.saleMonth;

        // Monthly
        const m = monthMap.get(e.saleMonth) || { earnings: 0, streams: 0 };
        m.earnings += e.earnings;
        m.streams += e.quantity;
        monthMap.set(e.saleMonth, m);

        // Platform
        const st = storeMap.get(e.store) || { earnings: 0, streams: 0 };
        st.earnings += e.earnings;
        st.streams += e.quantity;
        storeMap.set(e.store, st);

        // Song
        const key = e.isrc || e.title;
        const sg = songMap.get(key) || { title: e.title, artist: artist.name, isrc: e.isrc, earnings: 0, streams: 0 };
        sg.earnings += e.earnings;
        sg.streams += e.quantity;
        songMap.set(key, sg);

        // Country
        const c = countryMap.get(e.country) || { earnings: 0, streams: 0 };
        c.earnings += e.earnings;
        c.streams += e.quantity;
        countryMap.set(e.country, c);
      }

      const monthlyRevenue = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d]) => ({
          month,
          earnings: Math.round(d.earnings * 100) / 100,
          streams: d.streams,
          effectiveCpm: d.streams > 0 ? Math.round((d.earnings / d.streams) * 1000 * 100) / 100 : 0,
        }));

      const platformBreakdown = Array.from(storeMap.entries())
        .sort(([, a], [, b]) => b.earnings - a.earnings)
        .map(([store, d]) => ({
          store,
          earnings: Math.round(d.earnings * 100) / 100,
          streams: d.streams,
          cpm: d.streams > 0 ? Math.round((d.earnings / d.streams) * 1000 * 100) / 100 : 0,
          pct: totalEarnings > 0 ? Math.round((d.earnings / totalEarnings) * 1000) / 10 : 0,
        }));

      const songEarnings = Array.from(songMap.values())
        .sort((a, b) => b.earnings - a.earnings)
        .slice(0, 100)
        .map((s) => ({
          ...s,
          earnings: Math.round(s.earnings * 100) / 100,
          cpm: s.streams > 0 ? Math.round((s.earnings / s.streams) * 1000 * 100) / 100 : 0,
        }));

      const countryBreakdown = Array.from(countryMap.entries())
        .sort(([, a], [, b]) => b.earnings - a.earnings)
        .map(([country, d]) => ({
          country,
          earnings: Math.round(d.earnings * 100) / 100,
          streams: d.streams,
        }));

      distrokid = {
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        totalStreams,
        dateRange: [minMonth, maxMonth],
        artistName: artist.name,
        monthlyRevenue,
        platformBreakdown,
        songEarnings,
        countryBreakdown,
      };
    }

    return NextResponse.json({
      luminate,
      distrokid,
      luminateUploadedAt: artist.luminateUploadedAt,
      distrokidUploadedAt: artist.distrokidUploadedAt,
    });
  } catch (error) {
    console.error('Artist detail error:', error);
    return NextResponse.json({ error: 'Failed to load artist' }, { status: 500 });
  }
}
