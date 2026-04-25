import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ keys: [] });

    const pins = await prisma.pinnedMetric.findMany({
      where: { userId: session.user.id, artistId: '__template__' },
      orderBy: { position: 'asc' },
    });

    return NextResponse.json({ keys: pins.map(p => p.metricKey) });
  } catch {
    return NextResponse.json({ keys: [] });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { keys } = await request.json() as { keys: string[] };
    if (!Array.isArray(keys)) return NextResponse.json({ error: 'Invalid keys' }, { status: 400 });

    // Delete existing template pins
    await prisma.pinnedMetric.deleteMany({
      where: { userId: session.user.id, artistId: '__template__' },
    });

    // Create new pins with order
    if (keys.length > 0) {
      await prisma.pinnedMetric.createMany({
        data: keys.map((key, i) => ({
          userId: session.user!.id!,
          artistId: '__template__',
          metricKey: key,
          position: i,
        })),
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
