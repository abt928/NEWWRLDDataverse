'use client';
import { useReport } from './ReportContext';

export default function PinButton({ metricKey, className = '' }: { metricKey: string; className?: string }) {
  const { isPinned, togglePin } = useReport();
  const pinned = isPinned(metricKey);

  return (
    <button
      className={`pin-btn ${pinned ? 'pinned' : ''} ${className}`}
      onClick={(e) => { e.stopPropagation(); togglePin(metricKey); }}
      title={pinned ? 'Remove from report' : 'Add to report'}
      aria-label={pinned ? 'Remove from report' : 'Add to report'}
    >
      {pinned ? '✓' : '+'}
    </button>
  );
}
