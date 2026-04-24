import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const artists = await prisma.artist.findMany({
      where: { userId: session.user.id },
      include: {
        weekly: {
          orderBy: [{ year: 'desc' }, { week: 'desc' }],
          take: 12,
        },
        _count: {
          select: { songs: true, releases: true, distrokidData: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = artists.map((artist: any) => {
      const sorted = [...artist.weekly].sort((a: any, b: any) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.week - b.week;
      });
      const mostRecent = sorted[sorted.length - 1];
      const prior = sorted[sorted.length - 2];

      const atd = mostRecent?.atd ?? sorted.reduce((s: number, w: any) => s + w.quantity, 0);
      const ytd = mostRecent?.ytd ?? 0;
      const currentWeek = mostRecent?.quantity ?? 0;
      const wowChange = prior && prior.quantity > 0
        ? ((currentWeek - prior.quantity) / prior.quantity) * 100
        : 0;

      const avg12 = sorted.length > 0
        ? sorted.reduce((s: number, w: any) => s + w.quantity, 0) / sorted.length
        : 0;

      const sparkline = sorted.map((w: any) => w.quantity);

      return {
        id: artist.id,
        name: artist.name,
        genre: artist.genre,
        luminateId: artist.luminateId,
        atd,
        ytd,
        currentWeek,
        wowChange: Math.round(wowChange * 10) / 10,
        avg12w: Math.round(avg12),
        songCount: artist._count.songs,
        releaseCount: artist._count.releases,
        distrokidCount: artist._count.distrokidData,
        sparkline,
        lastUpdated: mostRecent?.dateRange ?? '',
        luminateUploadedAt: artist.luminateUploadedAt,
        distrokidUploadedAt: artist.distrokidUploadedAt,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Artists list error:', error);
    return NextResponse.json({ error: 'Failed to load artists' }, { status: 500 });
  }
}
