import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { calculateDeal, type DealInputs, type FormulaOverrides, type SongData, type MonthlyData } from '@/lib/deal-engine';

// Public endpoint — no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const share = await prisma.dealShare.findUnique({
      where: { token },
      include: {
        artist: {
          select: {
            id: true,
            name: true,
            genre: true,
            distrokidData: {
              select: {
                title: true,
                earnings: true,
                quantity: true,
                saleMonth: true,
              },
            },
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json({ error: 'Deal link not found' }, { status: 404 });
    }

    // Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json({ error: 'This deal link has expired' }, { status: 410 });
    }

    // Pre-aggregate song data from DK entries
    const songMap = new Map<string, { title: string; earnings: number; streams: number }>();
    for (const entry of share.artist.distrokidData) {
      const existing = songMap.get(entry.title) || { title: entry.title, earnings: 0, streams: 0 };
      existing.earnings += entry.earnings || 0;
      existing.streams += entry.quantity || 0;
      songMap.set(entry.title, existing);
    }
    const songData: SongData[] = Array.from(songMap.values())
      .sort((a, b) => b.earnings - a.earnings);

    // Pre-aggregate monthly data
    const monthMap = new Map<string, { earnings: number; streams: number }>();
    for (const entry of share.artist.distrokidData) {
      if (entry.saleMonth) {
        const existing = monthMap.get(entry.saleMonth) || { earnings: 0, streams: 0 };
        existing.earnings += entry.earnings || 0;
        existing.streams += entry.quantity || 0;
        monthMap.set(entry.saleMonth, existing);
      }
    }
    const monthlyData: MonthlyData[] = Array.from(monthMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate deal with the stored config AND formula overrides
    const dealConfig = share.dealConfig as unknown as DealInputs;
    const formulaOverrides = share.formulaOverrides as unknown as Partial<FormulaOverrides>;
    const dealOutput = calculateDeal(songData, monthlyData, dealConfig, formulaOverrides);

    return NextResponse.json({
      artistName: share.artist.name,
      genre: share.artist.genre,
      label: share.label,
      branding: share.branding || 'NEWWRLD',
      dealConfig,
      dealOutput,
      unlockedFields: share.unlockedFields as string[],
      constraints: share.constraints as Record<string, { min?: number; max?: number }>,
      // Aggregated data for client-side recalculation
      songData,
      monthlyData,
      // Formula overrides for client-side recalculation (but NOT exposed in UI)
      formulaOverrides,
      createdAt: share.createdAt,
    });
  } catch (error) {
    console.error('Deal share fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to load deal' },
      { status: 500 }
    );
  }
}
