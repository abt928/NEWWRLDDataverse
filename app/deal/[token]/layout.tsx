import type { Metadata } from 'next';
import prisma from '@/lib/db';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;

  let artistName = 'Artist';
  let branding = 'NEWWRLD';
  let ogHeadline = '';
  let ogDescription = '';

  try {
    const share = await prisma.dealShare.findUnique({
      where: { token },
      select: {
        branding: true,
        ogHeadline: true,
        ogDescription: true,
        artist: { select: { name: true } },
      },
    });
    if (share) {
      artistName = share.artist.name;
      if (share.branding) branding = share.branding;
      if (share.ogHeadline) ogHeadline = share.ogHeadline;
      if (share.ogDescription) ogDescription = share.ogDescription;
    }
  } catch {
    // Fallback to defaults
  }

  const title = ogHeadline || `${artistName} × ${branding} — Customize Your Offer`;
  const description = ogDescription || `${artistName} — explore and customize your deal terms with ${branding}. Adjust catalog size, exclusivity, royalties, and more.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: branding,
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
