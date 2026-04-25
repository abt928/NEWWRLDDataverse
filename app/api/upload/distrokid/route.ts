import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export const maxDuration = 60;

interface DKEntry {
  saleMonth: string;
  store: string;
  artist: string;
  title: string;
  isrc: string;
  country: string;
  quantity: number;
  earnings: number;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { entries, artistName }: { entries: DKEntry[]; artistName: string } = await req.json();

    if (!entries || !entries.length) {
      return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
    }

    console.log(`[dk-upload] ${entries.length} entries for "${artistName}"`);

    // Global dedup: find by name (shared across users)
    let artist = await prisma.artist.findFirst({
      where: { name: artistName },
    });

    if (!artist) {
      artist = await prisma.artist.create({
        data: { name: artistName, userId, distrokidUploadedAt: new Date() },
      });
      console.log(`[dk-upload] Created new artist: ${artist.id}`);
    } else {
      artist = await prisma.artist.update({
        where: { id: artist.id },
        data: { distrokidUploadedAt: new Date() },
      });
      console.log(`[dk-upload] Updated existing artist: ${artist.id}`);
    }

    // Bulk insert with skipDuplicates
    const createData = entries.map((e) => ({
      artistId: artist!.id,
      saleMonth: e.saleMonth || '',
      store: e.store || '',
      title: e.title || '',
      isrc: e.isrc || '',
      country: e.country || '',
      quantity: e.quantity || 0,
      earnings: e.earnings || 0,
    }));

    const result = await prisma.distroKidMonthly.createMany({
      data: createData,
      skipDuplicates: true,
    });

    console.log(`[dk-upload] ✅ ${result.count} rows inserted`);

    return NextResponse.json({
      success: true,
      artistId: artist.id,
      artistName: artist.name,
      rowsProcessed: result.count,
    });
  } catch (error) {
    console.error('[dk-upload] ❌ FAILED:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
