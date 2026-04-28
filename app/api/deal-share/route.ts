import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      artistId, dealConfig, unlockedFields, constraints,
      formulaOverrides, branding, ogHeadline, ogDescription,
      label, expiresInDays,
    } = await req.json();

    if (!artistId) {
      return NextResponse.json({ error: 'artistId is required' }, { status: 400 });
    }

    // Verify artist exists
    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000)
      : null;

    // Save formula overrides to artist record as default for this artist
    if (formulaOverrides && Object.keys(formulaOverrides).length > 0) {
      await prisma.artist.update({
        where: { id: artistId },
        data: { dealFormula: formulaOverrides },
      });
    }

    const share = await prisma.dealShare.create({
      data: {
        artistId,
        createdBy: session.user.id,
        dealConfig: dealConfig || {},
        unlockedFields: unlockedFields || [],
        constraints: constraints || {},
        formulaOverrides: formulaOverrides || {},
        branding: branding || 'NEWWRLD',
        ogHeadline: ogHeadline || '',
        ogDescription: ogDescription || '',
        label: label || `${artist.name} — Deal Calculator`,
        expiresAt,
      },
    });

    const origin = req.headers.get('origin') || req.nextUrl.origin;
    const url = `${origin}/deal/${share.token}`;

    return NextResponse.json({ success: true, token: share.token, url });
  } catch (error) {
    console.error('Deal share create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create deal share' },
      { status: 500 }
    );
  }
}
