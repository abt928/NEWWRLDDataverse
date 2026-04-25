'use client';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface ReportContextValue {
  pinnedKeys: string[];
  isPinned: (key: string) => boolean;
  togglePin: (key: string) => void;
  clearAll: () => void;
  reorderPins: (from: number, to: number) => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);

const STORAGE_KEY = 'report-template';

export function ReportProvider({ children }: { children: ReactNode }) {
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPinnedKeys(JSON.parse(stored));
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedKeys));
    } catch { /* ignore */ }
  }, [pinnedKeys, loaded]);

  // Background sync to API (fire-and-forget)
  useEffect(() => {
    if (!loaded || pinnedKeys.length === 0) return;
    const timeout = setTimeout(() => {
      fetch('/api/report-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: pinnedKeys }),
      }).catch(() => { /* silently fail */ });
    }, 1000); // Debounce 1s
    return () => clearTimeout(timeout);
  }, [pinnedKeys, loaded]);

  const isPinned = useCallback((key: string) => pinnedKeys.includes(key), [pinnedKeys]);

  const togglePin = useCallback((key: string) => {
    setPinnedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  const clearAll = useCallback(() => setPinnedKeys([]), []);

  const reorderPins = useCallback((from: number, to: number) => {
    setPinnedKeys(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  return (
    <ReportContext.Provider value={{ pinnedKeys, isPinned, togglePin, clearAll, reorderPins }}>
      {children}
    </ReportContext.Provider>
  );
}

export function useReport() {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReport must be used within ReportProvider');
  return ctx;
}

/** Human-readable labels for metric keys */
export const METRIC_LABELS: Record<string, string> = {
  'overview.allTimeStreams': 'All-Time Streams',
  'overview.thisWeek': 'This Week',
  'overview.avg12w': '12W Average',
  'overview.topSong': 'Top Song',
  'overview.peakWeek': 'Peak Week',
  'overview.streamingTimeline': 'Streaming Timeline',
  'growth.wow': 'Week-over-Week',
  'growth.avg4w': '4W Rolling Avg',
  'growth.avg12w': '12W Rolling Avg',
  'growth.velocity': 'Stream Velocity',
  'growth.weeklyChart': 'Weekly Streams Chart',
  'releases.table': 'Release Table',
  'songs.rankings': 'Song Rankings',
  'songs.trends': 'Song Trends',
  'catalog.ownership': 'Ownership Split',
  'catalog.concentration': 'Concentration Bars',
  'deal.revenueEstimate': 'Revenue Estimate',
  'deal.classification': 'Growth Classification',
  'deal.fanChart': 'Fan Chart',
  'deal.riskScenarios': 'Risk Scenarios',
  'deal.songConcentration': 'Song Concentration',
  'deal.summary': 'Quick Summary',
  'revenue.platforms': 'Platform Breakdown',
  'revenue.monthly': 'Monthly Revenue',
  'geo.breakdown': 'Geographic Breakdown',
  'cpm.calculator': 'CPM Calculator',
};
