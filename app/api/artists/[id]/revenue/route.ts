import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

// GET /api/artists/[id]/revenue — list manual revenue entries
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const entries = await prisma.manualRevenue.findMany({
      where: { artistId: id },
      orderBy: { month: 'desc' },
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error('Revenue list error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/artists/[id]/revenue — upsert a monthly revenue entry
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const { month, amount, note } = await req.json();

    if (!month || amount == null) {
      return NextResponse.json({ error: 'month and amount required' }, { status: 400 });
    }

    const entry = await prisma.manualRevenue.upsert({
      where: { artistId_month: { artistId: id, month } },
      create: { artistId: id, month, amount: parseFloat(amount), note: note || '' },
      update: { amount: parseFloat(amount), note: note || '' },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Revenue save error:', error);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}

// DELETE /api/artists/[id]/revenue — delete a monthly entry
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const { month } = await req.json();

    await prisma.manualRevenue.delete({
      where: { artistId_month: { artistId: id, month } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Revenue delete error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
