'use client';
import { useState } from 'react';
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

/** Human-readable label for the active date range */
function formatDateLabel(dateRange: [string, string] | null): string {
  if (!dateRange) return 'All Time';
  const [start, end] = dateRange;
  const fmt = (d: string) => {
    const [y, m] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  };
  return `${fmt(start)} — ${fmt(end)}`;
}

/** Count active advanced filters */
function countAdvancedFilters(filters: FilterState): number {
  let count = 0;
  if (filters.releaseType !== 'All') count++;
  if (filters.minStreams > 0) count++;
  if (filters.cpmLow !== 3.0) count++;
  if (filters.cpmHigh !== 5.0) count++;
  return count;
}

export default function FilterBar({ filters, onChange }: { filters: FilterState; onChange: (f: FilterState) => void }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activePreset = !filters.dateRange
    ? 'all'
    : (() => {
        for (const p of ['3m', '6m', 'ytd'] as const) {
          const r = getPresetRange(p);
          if (r && r[0] === filters.dateRange?.[0] && r[1] === filters.dateRange?.[1]) return p;
        }
        return 'custom';
      })();

  const advancedCount = countAdvancedFilters(filters);

  return (
    <div className="filter-bar-wrap">
      {/* Primary row: Time range + presets */}
      <div className="filter-bar-primary">
        <div className="filter-bar-time">
          <span className="filter-bar-icon" aria-hidden="true">◷</span>
          <div className="filter-bar-date-group">
            <input
              id="filter-date-start"
              className="filter-date"
              type="month"
              value={filters.dateRange?.[0] || ''}
              placeholder="Start"
              onChange={(e) => {
                const start = e.target.value;
                const end = filters.dateRange?.[1] || start;
                onChange({ ...filters, dateRange: start ? [start, end] : null });
              }}
            />
            <span className="filter-bar-separator">→</span>
            <input
              id="filter-date-end"
              className="filter-date"
              type="month"
              value={filters.dateRange?.[1] || ''}
              placeholder="End"
              onChange={(e) => {
                const end = e.target.value;
                const start = filters.dateRange?.[0] || end;
                onChange({ ...filters, dateRange: end ? [start, end] : null });
              }}
            />
          </div>
          <div className="filter-bar-presets">
            {(['3m', '6m', 'ytd', 'all'] as const).map((p) => (
              <button
                key={p}
                className={`filter-preset ${activePreset === p ? 'active' : ''}`}
                onClick={() => onChange({ ...filters, dateRange: p === 'all' ? null : getPresetRange(p) })}
              >
                {p === 'all' ? 'All' : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-bar-range-label">
          {formatDateLabel(filters.dateRange)}
        </div>

        <button
          className={`filter-bar-advanced-toggle ${showAdvanced ? 'open' : ''} ${advancedCount > 0 ? 'has-filters' : ''}`}
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
        >
          <span className="filter-bar-toggle-icon" aria-hidden="true">⚙</span>
          Filters
          {advancedCount > 0 && <span className="filter-bar-badge">{advancedCount}</span>}
          <span className={`filter-bar-chevron ${showAdvanced ? 'open' : ''}`} aria-hidden="true">›</span>
        </button>
      </div>

      {/* Advanced filters — collapsible */}
      <div className={`filter-bar-advanced ${showAdvanced ? 'open' : ''}`}>
        <div className="filter-bar-advanced-inner">
          <div className="filter-adv-group">
            <label className="filter-adv-label" htmlFor="filter-release-type">Release Type</label>
            <select
              id="filter-release-type"
              className="filter-adv-select"
              value={filters.releaseType}
              onChange={(e) => onChange({ ...filters, releaseType: e.target.value as FilterState['releaseType'] })}
            >
              <option value="All">All Releases</option>
              <option value="Single">Singles Only</option>
              <option value="Album">Albums Only</option>
            </select>
          </div>

          <div className="filter-adv-group">
            <label className="filter-adv-label" htmlFor="filter-min-streams">Min Streams</label>
            <input
              id="filter-min-streams"
              className="filter-adv-input"
              type="number"
              value={filters.minStreams}
              onChange={(e) => onChange({ ...filters, minStreams: Number(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>

          <div className="filter-adv-divider" />

          <div className="filter-adv-group">
            <label className="filter-adv-label" htmlFor="filter-cpm-low">CPM Low</label>
            <div className="filter-adv-input-wrap">
              <span className="filter-adv-prefix">$</span>
              <input
                id="filter-cpm-low"
                className="filter-adv-input has-prefix"
                type="number"
                step="0.1"
                value={filters.cpmLow}
                onChange={(e) => onChange({ ...filters, cpmLow: Number(e.target.value) || 3.0 })}
              />
            </div>
          </div>

          <div className="filter-adv-group">
            <label className="filter-adv-label" htmlFor="filter-cpm-high">CPM High</label>
            <div className="filter-adv-input-wrap">
              <span className="filter-adv-prefix">$</span>
              <input
                id="filter-cpm-high"
                className="filter-adv-input has-prefix"
                type="number"
                step="0.1"
                value={filters.cpmHigh}
                onChange={(e) => onChange({ ...filters, cpmHigh: Number(e.target.value) || 5.0 })}
              />
            </div>
          </div>

          {advancedCount > 0 && (
            <button
              className="filter-adv-reset"
              onClick={() => onChange({
                ...filters,
                releaseType: 'All',
                minStreams: 0,
                cpmLow: 3.0,
                cpmHigh: 5.0,
              })}
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
