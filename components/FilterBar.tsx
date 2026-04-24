'use client';
import type { FilterState } from '@/lib/types';

function getPresetRange(preset: string): [string, string] | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case '3m': {
      const d = new Date(y, m - 3, 1);
      return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, `${y}-${String(m + 1).padStart(2, '0')}`];
    }
    case '6m': {
      const d = new Date(y, m - 6, 1);
      return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, `${y}-${String(m + 1).padStart(2, '0')}`];
    }
    case 'ytd':
      return [`${y}-01`, `${y}-${String(m + 1).padStart(2, '0')}`];
    case 'all':
    default:
      return null;
  }
}

export default function FilterBar({ filters, onChange }: { filters: FilterState; onChange: (f: FilterState) => void }) {
  const activePreset = !filters.dateRange
    ? 'all'
    : (() => {
        for (const p of ['3m', '6m', 'ytd'] as const) {
          const r = getPresetRange(p);
          if (r && r[0] === filters.dateRange?.[0] && r[1] === filters.dateRange?.[1]) return p;
        }
        return 'custom';
      })();

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label className="filter-label" htmlFor="filter-date-start">From</label>
        <input
          id="filter-date-start"
          className="filter-input"
          type="month"
          value={filters.dateRange?.[0] || ''}
          onChange={(e) => {
            const start = e.target.value;
            const end = filters.dateRange?.[1] || start;
            onChange({ ...filters, dateRange: start ? [start, end] : null });
          }}
        />
      </div>
      <div className="filter-group">
        <label className="filter-label" htmlFor="filter-date-end">To</label>
        <input
          id="filter-date-end"
          className="filter-input"
          type="month"
          value={filters.dateRange?.[1] || ''}
          onChange={(e) => {
            const end = e.target.value;
            const start = filters.dateRange?.[0] || end;
            onChange({ ...filters, dateRange: end ? [start, end] : null });
          }}
        />
      </div>
      <div className="filter-presets">
        <button className={`filter-preset ${activePreset === '3m' ? 'active' : ''}`} onClick={() => onChange({ ...filters, dateRange: getPresetRange('3m') })}>3M</button>
        <button className={`filter-preset ${activePreset === '6m' ? 'active' : ''}`} onClick={() => onChange({ ...filters, dateRange: getPresetRange('6m') })}>6M</button>
        <button className={`filter-preset ${activePreset === 'ytd' ? 'active' : ''}`} onClick={() => onChange({ ...filters, dateRange: getPresetRange('ytd') })}>YTD</button>
        <button className={`filter-preset ${activePreset === 'all' ? 'active' : ''}`} onClick={() => onChange({ ...filters, dateRange: null })}>All</button>
      </div>
      <div className="filter-group">
        <label className="filter-label" htmlFor="filter-release-type">Release Type</label>
        <select id="filter-release-type" className="filter-select" value={filters.releaseType} onChange={(e) => onChange({ ...filters, releaseType: e.target.value as FilterState['releaseType'] })}>
          <option value="All">All</option>
          <option value="Single">Singles</option>
          <option value="Album">Albums</option>
        </select>
      </div>
      <div className="filter-group">
        <label className="filter-label" htmlFor="filter-min-streams">Min Streams</label>
        <input id="filter-min-streams" className="filter-input" type="number" value={filters.minStreams} onChange={(e) => onChange({ ...filters, minStreams: Number(e.target.value) || 0 })} />
      </div>
      <div className="filter-group">
        <label className="filter-label" htmlFor="filter-cpm-low">CPM Low ($)</label>
        <input id="filter-cpm-low" className="filter-input" type="number" step="0.1" value={filters.cpmLow} onChange={(e) => onChange({ ...filters, cpmLow: Number(e.target.value) || 3.0 })} />
      </div>
      <div className="filter-group">
        <label className="filter-label" htmlFor="filter-cpm-high">CPM High ($)</label>
        <input id="filter-cpm-high" className="filter-input" type="number" step="0.1" value={filters.cpmHigh} onChange={(e) => onChange({ ...filters, cpmHigh: Number(e.target.value) || 5.0 })} />
      </div>
    </div>
  );
}
