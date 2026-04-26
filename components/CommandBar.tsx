'use client';
import type { FilterState } from '@/lib/types';

// ── Preset helpers ──────────────────────────────────────────

function getPresetRange(preset: string): [string, string] | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const current = fmt(now);
  switch (preset) {
    case '3m': return [fmt(new Date(y, m - 3, 1)), current];
    case '6m': return [fmt(new Date(y, m - 6, 1)), current];
    case 'ytd': return [`${y}-01`, current];
    case 'all':
    default: return null;
  }
}

function formatDateLabel(dateRange: [string, string] | null): string {
  if (!dateRange) return 'All Time';
  const [start, end] = dateRange;
  const fmt = (d: string) => {
    const [y, m] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

// ── Panel context definitions ───────────────────────────────

type PanelId = string;

interface PanelContext {
  showTimeRange: boolean;
  controls?: React.ReactNode;
}

function getPanelContext(
  panel: PanelId,
  filters: FilterState,
  onChange: (f: FilterState) => void
): PanelContext {
  switch (panel) {
    case 'overview':
    case 'timeline':
    case 'trends':
    case 'growth':
      return { showTimeRange: true };

    case 'releases':
      return {
        showTimeRange: true,
        controls: (
          <div className="cb-context-group">
            <label className="cb-context-label" htmlFor="cb-release-type">Type</label>
            <select
              id="cb-release-type"
              className="cb-context-select"
              value={filters.releaseType}
              onChange={(e) => onChange({ ...filters, releaseType: e.target.value as FilterState['releaseType'] })}
            >
              <option value="All">All</option>
              <option value="Single">Singles</option>
              <option value="Album">Albums</option>
            </select>
          </div>
        ),
      };

    case 'songs':
      return {
        showTimeRange: true,
        controls: (
          <div className="cb-context-group">
            <label className="cb-context-label" htmlFor="cb-min-streams">Min Streams</label>
            <input
              id="cb-min-streams"
              className="cb-context-input"
              type="number"
              value={filters.minStreams || ''}
              onChange={(e) => onChange({ ...filters, minStreams: Number(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>
        ),
      };

    case 'catalog':
      return {
        showTimeRange: true,
        controls: (
          <div className="cb-context-group">
            <label className="cb-context-label" htmlFor="cb-release-type-cat">Type</label>
            <select
              id="cb-release-type-cat"
              className="cb-context-select"
              value={filters.releaseType}
              onChange={(e) => onChange({ ...filters, releaseType: e.target.value as FilterState['releaseType'] })}
            >
              <option value="All">All</option>
              <option value="Single">Singles</option>
              <option value="Album">Albums</option>
            </select>
          </div>
        ),
      };

    case 'geo':
      return { showTimeRange: true };

    case 'deal':
      return { showTimeRange: true };

    case 'revenue':
      return { showTimeRange: false }; // DistroKid has its own date range

    // CPM, Data Integrity, Contracts, Outreach — no command bar
    case 'cpm':
    case 'integrity':
    case 'contracts':
    case 'outreach':
      return { showTimeRange: false };

    default:
      return { showTimeRange: true };
  }
}

// ── Component ───────────────────────────────────────────────

export default function CommandBar({
  activePanel,
  filters,
  onChange,
}: {
  activePanel: string;
  filters: FilterState;
  onChange: (f: FilterState) => void;
}) {
  const ctx = getPanelContext(activePanel, filters, onChange);

  // Don't render for panels that don't need it
  if (!ctx.showTimeRange && !ctx.controls) return null;

  const activePreset = !filters.dateRange
    ? 'all'
    : (() => {
        for (const p of ['3m', '6m', 'ytd'] as const) {
          const r = getPresetRange(p);
          if (r && r[0] === filters.dateRange?.[0] && r[1] === filters.dateRange?.[1]) return p;
        }
        return 'custom';
      })();

  const hasActiveFilters = filters.dateRange !== null ||
    filters.releaseType !== 'All' ||
    filters.minStreams > 0;

  return (
    <div className="cb-wrap">
      <div className="cb-bar">
        {/* Time range presets */}
        {ctx.showTimeRange && (
          <div className="cb-time-section">
            <div className="cb-presets">
              {(['3m', '6m', 'ytd', 'all'] as const).map((p) => (
                <button
                  key={p}
                  className={`cb-preset ${activePreset === p ? 'active' : ''}`}
                  onClick={() => onChange({ ...filters, dateRange: p === 'all' ? null : getPresetRange(p) })}
                  aria-label={`Filter to ${p === 'all' ? 'all time' : p.toUpperCase()}`}
                >
                  {p === 'all' ? 'All' : p.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="cb-range-label">{formatDateLabel(filters.dateRange)}</span>
          </div>
        )}

        {/* Context-specific controls */}
        {ctx.controls && (
          <div className="cb-context-section">
            <div className="cb-divider" />
            {ctx.controls}
          </div>
        )}

        {/* Reset button */}
        {hasActiveFilters && (
          <button
            className="cb-reset"
            onClick={() => onChange({ dateRange: null, releaseType: 'All', artistFilter: 'all', minStreams: 0 })}
            aria-label="Reset all filters"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
