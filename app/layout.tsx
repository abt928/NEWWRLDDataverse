import type { Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import GlobalDropZone from '@/components/GlobalDropZone';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEWWRLD Dataverse — Streaming Data Intelligence',
  description: 'Professional streaming analytics for artist acquisition & catalog management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <SessionProvider>
          {children}
          <GlobalDropZone />
        </SessionProvider>
      </body>
    </html>
  );
}
