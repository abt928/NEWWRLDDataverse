import type { Metadata } from 'next';
import prisma from '@/lib/db';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;

  let artistName = 'Artist';
  let label = 'Deal Calculator';

  try {
    const share = await prisma.dealShare.findUnique({
      where: { token },
      select: {
        label: true,
        artist: { select: { name: true } },
      },
    });
    if (share) {
      artistName = share.artist.name;
      if (share.label) label = share.label;
    }
  } catch {
    // Fallback to defaults
  }

  const title = `${artistName} × NEWWRLD — Customize Your Offer`;
  const description = `${artistName} — explore and customize your deal terms with NEWWRLD. Adjust catalog size, exclusivity, royalties, and more.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'NEWWRLD',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function DealShareLayout({ children }: LayoutProps) {
  return children;
}
