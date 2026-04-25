'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function SharePage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    // The share link IS the artist page — redirect
    if (params.id) {
      router.replace(`/artist/${params.id}`);
    }
  }, [params.id, router]);

  return (
    <div className="home-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="home-loading"><div className="spinner" /><p>Loading shared report…</p></div>
    </div>
  );
}
