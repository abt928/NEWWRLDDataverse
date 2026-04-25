'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UploadResult {
  fileName: string;
  type: 'luminate' | 'distrokid';
  status: 'uploading' | 'success' | 'error';
  artistName?: string;
  artistId?: string;
  error?: string;
  stats?: {
    weeklyRows?: number;
    releases?: number;
    songs?: number;
    songWeeklyRows?: number;
    rowsProcessed?: number;
    isNew?: boolean;
  };
}

export default function GlobalDropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const dragCounterRef = useRef(0);

  // Track drag enter/leave at window level
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files.length) {
        processFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processFiles = useCallback(async (files: FileList) => {
    const validFiles: { file: File; type: 'luminate' | 'distrokid' }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const name = file.name.toLowerCase();
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        validFiles.push({ file, type: 'luminate' });
      } else if (name.endsWith('.zip')) {
        validFiles.push({ file, type: 'distrokid' });
      }
    }

    if (validFiles.length === 0) return;

    // Initialize results
    const initialResults: UploadResult[] = validFiles.map(({ file, type }) => ({
      fileName: file.name,
      type,
      status: 'uploading' as const,
    }));

    setResults(initialResults);
    setShowResults(true);

    // Process each file
    for (let i = 0; i < validFiles.length; i++) {
      const { file, type } = validFiles[i];

      try {
        if (type === 'distrokid') {
          const { parseDistroKidZip } = await import('@/lib/distrokid-parser');
          const buffer = await file.arrayBuffer();
          const parsed = await parseDistroKidZip(buffer);
          const rawEntries = parsed.rawEntries || [];

          const BATCH_SIZE = 500;
          let totalUpserted = 0;
          let artistId = '';
          for (let j = 0; j < rawEntries.length; j += BATCH_SIZE) {
            const batch = rawEntries.slice(j, j + BATCH_SIZE).map((e: any) => ({
              saleMonth: e.saleMonth,
              store: e.store,
              artist: e.artist,
              title: e.title,
              isrc: e.isrc,
              country: e.country,
              quantity: e.quantity,
              earnings: e.earnings,
            }));
            const res = await fetch('/api/upload/distrokid', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ entries: batch, artistName: parsed.artistName }),
            });
            if (res.ok) {
              const result = await res.json();
              totalUpserted += result.rowsProcessed || 0;
              if (result.artistId) artistId = result.artistId;
            }
          }

          setResults(prev => prev.map((r, idx) => idx === i ? {
            ...r,
            status: 'success' as const,
            artistName: parsed.artistName,
            artistId,
            stats: { rowsProcessed: totalUpserted },
          } : r));
        } else {
          // Luminate
          const formData = new FormData();
          formData.append('file', file);
          formData.append('type', 'luminate');

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            const result = await res.json();
            setResults(prev => prev.map((r, idx) => idx === i ? {
              ...r,
              status: 'success' as const,
              artistName: result.artistName,
              artistId: result.artistId,
              stats: result.stats,
            } : r));
          } else {
            let errMsg = 'Upload failed';
            try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
            throw new Error(errMsg);
          }
        }
      } catch (err) {
        setResults(prev => prev.map((r, idx) => idx === i ? {
          ...r,
          status: 'error' as const,
          error: err instanceof Error ? err.message : 'Upload failed',
        } : r));
      }
    }
  }, []);

  const allDone = results.length > 0 && results.every(r => r.status !== 'uploading');
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  const handleDismiss = useCallback(() => {
    setShowResults(false);
    setResults([]);
    // Reload page to reflect new data
    if (successCount > 0) {
      window.location.reload();
    }
  }, [successCount]);

  return (
    <>
      {/* Full-screen drag overlay */}
      {isDragging && (
        <div className="global-drop-overlay">
          <div className="global-drop-content">
            <div className="global-drop-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h2 className="global-drop-title">Drop files to upload</h2>
            <p className="global-drop-subtitle">Luminate (.xlsx) · DistroKid (.zip) · Activity Over Time (.xlsx)</p>
            <div className="global-drop-border" />
          </div>
        </div>
      )}

      {/* Results panel */}
      {showResults && (
        <div className="global-drop-results-overlay" onClick={allDone ? handleDismiss : undefined}>
          <div className="global-drop-results" onClick={e => e.stopPropagation()}>
            <div className="drop-results-header">
              <h3>{allDone ? 'Upload Complete' : 'Uploading…'}</h3>
              {allDone && (
                <button className="drop-results-close" onClick={handleDismiss}>✕</button>
              )}
            </div>

            {/* Summary bar */}
            {allDone && (
              <div className="drop-results-summary">
                {successCount > 0 && (
                  <span className="drop-summary-badge drop-summary-success">
                    {successCount} saved
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="drop-summary-badge drop-summary-error">
                    {errorCount} failed
                  </span>
                )}
              </div>
            )}

            {/* File list */}
            <div className="drop-results-list">
              {results.map((r, i) => (
                <div key={i} className={`drop-result-item drop-result-${r.status}`}>
                  <div className="drop-result-status">
                    {r.status === 'uploading' && <div className="drop-spinner" />}
                    {r.status === 'success' && <span className="drop-check">✓</span>}
                    {r.status === 'error' && <span className="drop-error-icon">✗</span>}
                  </div>
                  <div className="drop-result-info">
                    <div className="drop-result-name">{r.fileName}</div>
                    <div className="drop-result-meta">
                      {r.status === 'uploading' && (
                        <span className="drop-meta-uploading">Processing…</span>
                      )}
                      {r.status === 'success' && r.artistName && (
                        <>
                          <span className="drop-meta-artist">{r.artistName}</span>
                          {r.type === 'luminate' && r.stats && (
                            <span className="drop-meta-stats">
                              {r.stats.weeklyRows} weeks · {r.stats.songs} songs · {r.stats.releases} releases
                            </span>
                          )}
                          {r.type === 'distrokid' && r.stats?.rowsProcessed && (
                            <span className="drop-meta-stats">
                              {r.stats.rowsProcessed.toLocaleString()} earnings rows
                            </span>
                          )}
                        </>
                      )}
                      {r.status === 'error' && (
                        <span className="drop-meta-error">{r.error}</span>
                      )}
                    </div>
                  </div>
                  <span className={`drop-result-type ${r.type}`}>
                    {r.type === 'luminate' ? 'Luminate' : 'DistroKid'}
                  </span>
                </div>
              ))}
            </div>

            {/* Action */}
            {allDone && (
              <div className="drop-results-actions">
                <button className="btn-primary" onClick={handleDismiss}>
                  {successCount > 0 ? 'Refresh Dashboard' : 'Dismiss'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
