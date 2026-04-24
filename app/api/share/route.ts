import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { artistId, expiresInDays } = await req.json();
    if (!artistId) {
      return NextResponse.json({ error: 'artistId is required' }, { status: 400 });
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000)
      : null;

    const link = await prisma.shareLink.create({
      data: {
        userId: session.user.id,
        artistId,
        expiresAt,
      },
    });

    const origin = req.headers.get('origin') || req.nextUrl.origin;
    const url = `${origin}/share/${link.token}`;

    return NextResponse.json({ success: true, token: link.token, url });
  } catch (error) {
    console.error('Share link error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create share link' },
      { status: 500 }
    );
  }
}
