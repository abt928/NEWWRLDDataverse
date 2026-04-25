'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { LuminateDataset, DistroKidDataset } from '@/lib/types';
import Dashboard from '@/components/Dashboard';

interface ArtistResponse {
  luminate: LuminateDataset | null;
  distrokid: DistroKidDataset | null;
  luminateUploadedAt: string | null;
  distrokidUploadedAt: string | null;
}

export default function ArtistPage() {
  const params = useParams();
  const [response, setResponse] = useState<ArtistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/artists/${params.id}`);
        if (!res.ok) throw new Error('Artist not found');
        const data: ArtistResponse = await res.json();
        setResponse(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    if (params.id) load();
  }, [params.id]);

  if (error) return (
    <div className="home-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Error</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
        <a href="/" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem' }}>← Back to Home</a>
      </div>
    </div>
  );

  if (!response) return (
    <div className="home-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="home-loading"><div className="spinner" /><p>Loading dashboard…</p></div>
    </div>
  );

  return (
    <Dashboard
      data={response.luminate || undefined}
      distrokid={response.distrokid || undefined}
      onReset={() => window.location.href = '/'}
      artistId={params.id as string}
      luminateUploadedAt={response.luminateUploadedAt}
      distrokidUploadedAt={response.distrokidUploadedAt}
    />
  );
}
