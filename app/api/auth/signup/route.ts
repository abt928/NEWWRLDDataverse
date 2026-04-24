import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, passkey } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Password required unless passkey-only signup
    if (!passkey && !password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      // For passkey registration, allow existing user (they'll register passkey next)
      if (passkey) {
        return NextResponse.json({
          success: true,
          user: { id: existing.id, email: existing.email, name: existing.name },
        });
      }
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    // Hash password if provided
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name: name || null,
      },
    });

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Signup failed' },
      { status: 500 }
    );
  }
}
