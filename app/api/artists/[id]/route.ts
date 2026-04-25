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
        manualRevenue: { orderBy: { month: 'desc' } },
        uploads: { orderBy: { uploadedAt: 'desc' } },
      },
    });

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Build Luminate dataset if ANY luminate data exists (weekly, songs, releases, or upload marker)
    const hasLuminate = artist.weekly.length > 0 || artist.songs.length > 0 || artist.releases.length > 0 || !!artist.luminateUploadedAt;

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

    // Separate weekly data by location — Worldwide is primary for all analytics
    const allWeekly = artist.weekly as any[];
    const worldwideWeekly = allWeekly.filter((w: any) => w.location === 'Worldwide');
    const usWeekly = allWeekly.filter((w: any) => w.location === 'United States');
    const mxWeekly = allWeekly.filter((w: any) => w.location === 'Mexico');

    // Use Worldwide as main data source for analytics
    const primaryWeekly = worldwideWeekly.length > 0 ? worldwideWeekly : allWeekly.filter((w: any) => w.location === allWeekly[0]?.location);

    const artistWeekly: ArtistWeekly[] = primaryWeekly.map((w: any) => ({
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

    // Build geo breakdown: { month: { us, mx, worldwide, other } }
    const geoBreakdown: Record<string, { worldwide: number; us: number; mx: number; other: number }> = {};
    const weekKey = (w: any) => `${w.year}-W${String(w.week).padStart(2, '0')}`;

    const wwMap = new Map<string, number>();
    for (const w of worldwideWeekly) wwMap.set(weekKey(w), w.quantity);
    const usMap = new Map<string, number>();
    for (const w of usWeekly) usMap.set(weekKey(w), w.quantity);
    const mxMap = new Map<string, number>();
    for (const w of mxWeekly) mxMap.set(weekKey(w), w.quantity);

    const allKeys = new Set([...wwMap.keys(), ...usMap.keys(), ...mxMap.keys()]);
    for (const key of allKeys) {
      const ww = wwMap.get(key) || 0;
      const us = usMap.get(key) || 0;
      const mx = mxMap.get(key) || 0;
      geoBreakdown[key] = {
        worldwide: ww,
        us,
        mx,
        other: Math.max(0, ww - us - mx),
      };
    }

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
      const monthMap = new Map<string, { earnings: number; streams: number; coreStreams: number }>();
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
        const m = monthMap.get(e.saleMonth) || { earnings: 0, streams: 0, coreStreams: 0 };
        m.earnings += e.earnings;
        m.streams += e.quantity;
        if (e.store === 'Spotify' || e.store === 'Apple Music') {
          m.coreStreams += e.quantity;
        }
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
          coreStreams: d.coreStreams,
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

    // Compute geo summary stats for sidebar
    const geoSummary = {
      hasGeoData: usWeekly.length > 0 || mxWeekly.length > 0,
      locations: [
        ...(worldwideWeekly.length > 0 ? [{ location: 'Worldwide', weeks: worldwideWeekly.length, totalStreams: worldwideWeekly.reduce((s: number, w: any) => s + w.quantity, 0) }] : []),
        ...(usWeekly.length > 0 ? [{ location: 'United States', weeks: usWeekly.length, totalStreams: usWeekly.reduce((s: number, w: any) => s + w.quantity, 0) }] : []),
        ...(mxWeekly.length > 0 ? [{ location: 'Mexico', weeks: mxWeekly.length, totalStreams: mxWeekly.reduce((s: number, w: any) => s + w.quantity, 0) }] : []),
      ],
    };

    // Compute data coverage: per-location, which weeks have data and where are gaps
    const coverageByLocation = new Map<string, { weeks: { week: number; year: number; quantity: number }[]; totalStreams: number }>();
    for (const w of allWeekly) {
      const loc = w.location;
      const entry = coverageByLocation.get(loc) || { weeks: [], totalStreams: 0 };
      entry.weeks.push({ week: w.week, year: w.year, quantity: w.quantity });
      entry.totalStreams += w.quantity;
      coverageByLocation.set(loc, entry);
    }

    const dataCoverage = Array.from(coverageByLocation.entries()).map(([location, data]) => {
      const sorted = data.weeks.sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      
      // Find gaps (missing weeks in the sequence)
      const gaps: { fromWeek: number; fromYear: number; toWeek: number; toYear: number; missingWeeks: number }[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        // Calculate expected next week
        let nextWeek = prev.week + 1;
        let nextYear = prev.year;
        if (nextWeek > 52) { nextWeek = 1; nextYear++; }
        
        if (curr.year !== nextYear || curr.week !== nextWeek) {
          // There's a gap
          const missingWeeks = (curr.year - prev.year) * 52 + (curr.week - prev.week) - 1;
          if (missingWeeks > 0) {
            gaps.push({
              fromWeek: nextWeek, fromYear: nextYear,
              toWeek: curr.week > 1 ? curr.week - 1 : 52,
              toYear: curr.week > 1 ? curr.year : curr.year - 1,
              missingWeeks,
            });
          }
        }
      }

      return {
        location,
        weekCount: sorted.length,
        totalStreams: data.totalStreams,
        firstWeek: first ? { week: first.week, year: first.year } : null,
        lastWeek: last ? { week: last.week, year: last.year } : null,
        gaps,
      };
    });

    return NextResponse.json({
      luminate,
      distrokid,
      geoBreakdown: Object.keys(geoBreakdown).length > 0 ? geoBreakdown : null,
      geoSummary,
      manualRevenue: artist.manualRevenue,
      luminateUploadedAt: artist.luminateUploadedAt,
      distrokidUploadedAt: artist.distrokidUploadedAt,
      dataCoverage,
      uploads: (artist.uploads || []).map((u: any) => ({
        id: u.id,
        fileName: u.fileName,
        fileType: u.fileType,
        location: u.location,
        weekCount: u.weekCount,
        songCount: u.songCount,
        totalStreams: Number(u.totalStreams),
        uploadedAt: u.uploadedAt,
      })),
    });
  } catch (error) {
    console.error('Artist detail error:', error);
    return NextResponse.json({ error: 'Failed to load artist' }, { status: 500 });
  }
}
