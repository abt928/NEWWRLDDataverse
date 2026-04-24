import type { Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEWWRLD Dataverse — Streaming Data Intelligence',
  description: 'Professional streaming analytics for artist acquisition & catalog management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
