import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

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

    // Find or create artist for this user
    let artist = await prisma.artist.findFirst({
      where: { userId, name: artistName },
    });

    if (!artist) {
      artist = await prisma.artist.create({
        data: {
          name: artistName,
          userId,
          distrokidUploadedAt: new Date(),
        },
      });
    } else {
      artist = await prisma.artist.update({
        where: { id: artist.id },
        data: { distrokidUploadedAt: new Date() },
      });
    }

    // Batch upsert DistroKid data (dedup via composite unique)
    let upserted = 0;
    for (const entry of entries) {
      try {
        await prisma.distroKidMonthly.upsert({
          where: {
            artistId_saleMonth_store_title_isrc_country: {
              artistId: artist.id,
              saleMonth: entry.saleMonth,
              store: entry.store,
              title: entry.title,
              isrc: entry.isrc || '',
              country: entry.country || '',
            },
          },
          create: {
            artistId: artist.id,
            saleMonth: entry.saleMonth,
            store: entry.store,
            title: entry.title,
            isrc: entry.isrc || '',
            country: entry.country || '',
            quantity: entry.quantity,
            earnings: entry.earnings,
          },
          update: {
            quantity: entry.quantity,
            earnings: entry.earnings,
          },
        });
        upserted++;
      } catch {
        // Skip individual row errors
      }
    }

    return NextResponse.json({
      success: true,
      artistId: artist.id,
      artistName: artist.name,
      rowsProcessed: upserted,
    });
  } catch (error) {
    console.error('DistroKid upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
