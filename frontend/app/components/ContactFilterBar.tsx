'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

// Tag with count from API
export interface TagWithCount {
  id: string;
  name: string;
  color: string | null;
  conversationCount: number;
}

// Last active filter options
export type LastActiveFilter = 'all' | 'today' | 'week' | 'month' | '3months' | 'older';

// Type filter options
export type TypeFilter = 'all' | 'people' | 'groups' | 'channels';

const LAST_ACTIVE_OPTIONS: { key: LastActiveFilter; label: string }[] = [
  { key: 'all', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: '3months', label: '3 months' },
  { key: 'older', label: 'Older' },
];

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'people', label: 'People' },
  { key: 'groups', label: 'Groups' },
  { key: 'channels', label: 'Channels' },
];

interface ContactFilterBarProps {
  // Tag filtering - now supports multi-select
  tags: TagWithCount[];
  selectedTagIds: string[];
  onTagSelect: (tagIds: string[]) => void;
  totalCount: number;
  // Last active filtering - now supports multi-select
  lastActiveFilters: LastActiveFilter[];
  onLastActiveChange: (filters: LastActiveFilter[]) => void;
  // Type filter
  typeFilter?: TypeFilter;
  onTypeFilterChange?: (type: TypeFilter) => void;
  // Loading state
  isLoading?: boolean;
  isCountsLoading?: boolean; // Show skeleton for counts during initial load
  // Counts for type filters
  typeCounts?: { all: number; people: number; groups: number; channels: number };
  // Search (moved from header)
  search?: string;
  onSearchChange?: (search: string) => void;
  isSearching?: boolean;
  // Export
  onExport?: () => void;
  // AI Settings
  onAISettings?: () => void;
  hasAiEnabledTag?: boolean; // Show indicator if any filtered tag has AI enabled
}

/**
 * Linear-style filter bar with:
 * 1. Equal-width filter boxes showing main tag filters with counts
 * 2. Below: Secondary filter pills with multi-select dropdowns
 */
export default function ContactFilterBar({
  tags,
  selectedTagIds,
  onTagSelect,
  totalCount,
  lastActiveFilters,
  onLastActiveChange,
  typeFilter = 'all',
  onTypeFilterChange,
  isLoading = false,
  isCountsLoading = false,
  typeCounts,
  search = '',
  onSearchChange,
  isSearching = false,
  onExport,
  onAISettings,
  hasAiEnabledTag = false,
}: ContactFilterBarProps) {
  // Dropdown states
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isLastActiveDropdownOpen, setIsLastActiveDropdownOpen] = useState(false);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const lastActiveDropdownRef = useRef<HTMLDivElement>(null);
  const moreFiltersRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setIsTagDropdownOpen(false);
      }
      if (lastActiveDropdownRef.current && !lastActiveDropdownRef.current.contains(e.target as Node)) {
        setIsLastActiveDropdownOpen(false);
      }
      if (moreFiltersRef.current && !moreFiltersRef.current.contains(e.target as Node)) {
        setIsMoreFiltersOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sort tags by count (descending), get top tags for display
  const sortedTags = useMemo(() => {
    return [...tags]
      .filter(tag => tag.conversationCount > 0)
      .sort((a, b) => b.conversationCount - a.conversationCount);
  }, [tags]);

  // Top 5 tags for the big boxes (show most important ones)
  const topTags = sortedTags.slice(0, 5);

  // All tags for dropdown
  const allTagsForDropdown = sortedTags;

  // Get selected tag names for pill label (single-select)
  const selectedTagNames = selectedTagIds
    .map(id => tags.find(t => t.id === id)?.name)
    .filter(Boolean);

  // Get selected last active labels
  const selectedLastActiveLabels = lastActiveFilters
    .filter(f => f !== 'all')
    .map(f => LAST_ACTIVE_OPTIONS.find(o => o.key === f)?.label)
    .filter(Boolean);

  // Check if any filters are active
  const hasActiveFilters = selectedTagIds.length > 0 ||
    (lastActiveFilters.length > 0 && !lastActiveFilters.includes('all')) ||
    typeFilter !== 'all';

  // Check if type filter is active for "more filters" badge
  const moreFiltersCount = typeFilter !== 'all' ? 1 : 0;

  // Handle tag toggle in primary boxes
  const handleTagToggle = (tagId: string | null) => {
    if (tagId === null) {
      // "All" clicked - clear all tag selections
      onTagSelect([]);
    } else {
      // Single-select: clicking again clears, otherwise replace
      onTagSelect(selectedTagIds.includes(tagId) ? [] : [tagId]);
    }
  };

  // Handle last active toggle
  const handleLastActiveToggle = (filter: LastActiveFilter) => {
    if (filter === 'all') {
      onLastActiveChange(['all']);
    } else {
      const withoutAll = lastActiveFilters.filter(f => f !== 'all');
      if (withoutAll.includes(filter)) {
        const newFilters = withoutAll.filter(f => f !== filter);
        onLastActiveChange(newFilters.length === 0 ? ['all'] : newFilters);
      } else {
        onLastActiveChange([...withoutAll, filter]);
      }
    }
  };

  // Clear all filters
  const handleClearAll = () => {
    onTagSelect([]);
    onLastActiveChange(['all']);
    onTypeFilterChange?.('all');
  };

  return (
    <div style={{ background: 'var(--bg-primary)' }}>
      {/* Primary Filter Boxes - Linear style with equal widths */}
      <div
        style={{
          display: 'flex',
          padding: '16px 24px',
          gap: '1px',
          background: 'var(--border-subtle)',
        }}
      >
        {/* "All" box - always first */}
        <FilterBox
          label="All"
          count={totalCount}
          isSelected={selectedTagIds.length === 0}
          onClick={() => handleTagToggle(null)}
          position="first"
          totalBoxes={topTags.length + 1}
          isCountLoading={isCountsLoading}
        />

        {/* Top tag boxes */}
        {topTags.map((tag, index) => (
          <FilterBox
            key={tag.id}
            label={tag.name}
            count={tag.conversationCount}
            color={tag.color}
            isSelected={selectedTagIds.includes(tag.id)}
            onClick={() => handleTagToggle(tag.id)}
            position={index === topTags.length - 1 ? 'last' : 'middle'}
            totalBoxes={topTags.length + 1}
            isCountLoading={isCountsLoading}
          />
        ))}
      </div>

      {/* Secondary Filters Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-primary)',
        }}
      >
        {/* Tag Filter Dropdown - multi-select */}
        <div ref={tagDropdownRef} style={{ position: 'relative' }}>
          <FilterPill
            icon={<TagIcon />}
            label={selectedTagNames.length > 0
              ? selectedTagNames[0]!
              : 'Tags'}
            isActive={selectedTagIds.length > 0}
            onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
            hasDropdown
            isLoading={isLoading && selectedTagIds.length > 0}
          />

          {isTagDropdownOpen && (
            <DropdownMenu>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Select tag
                </span>
              </div>
              <div style={{ padding: '4px' }}>
                {allTagsForDropdown.map(tag => (
                  <DropdownCheckboxItem
                    key={tag.id}
                    label={tag.name}
                    count={tag.conversationCount}
                    color={tag.color}
                    isChecked={selectedTagIds.includes(tag.id)}
                    onClick={() => {
                      handleTagToggle(tag.id);
                      // Single-select: close after choose
                      setIsTagDropdownOpen(false);
                    }}
                  />
                ))}
                {allTagsForDropdown.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    No tags available
                  </div>
                )}
              </div>
              {selectedTagIds.length > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => {
                      onTagSelect([]);
                      setIsTagDropdownOpen(false);
                    }}
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </DropdownMenu>
          )}
        </div>

        {/* Last Active Filter Dropdown - multi-select */}
        <div ref={lastActiveDropdownRef} style={{ position: 'relative' }}>
          <FilterPill
            icon={<ClockIcon />}
            label={selectedLastActiveLabels.length > 0
              ? selectedLastActiveLabels.length === 1
                ? selectedLastActiveLabels[0]!
                : `${selectedLastActiveLabels.length} periods`
              : 'Last active'}
            isActive={lastActiveFilters.length > 0 && !lastActiveFilters.includes('all')}
            onClick={() => setIsLastActiveDropdownOpen(!isLastActiveDropdownOpen)}
            hasDropdown
            count={selectedLastActiveLabels.length > 1 ? selectedLastActiveLabels.length : undefined}
          />

          {isLastActiveDropdownOpen && (
            <DropdownMenu>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Last active
                </span>
              </div>
              <div style={{ padding: '4px' }}>
                {LAST_ACTIVE_OPTIONS.map(option => (
                  <DropdownCheckboxItem
                    key={option.key}
                    label={option.label}
                    isChecked={option.key === 'all'
                      ? lastActiveFilters.includes('all') || lastActiveFilters.length === 0
                      : lastActiveFilters.includes(option.key)}
                    onClick={() => handleLastActiveToggle(option.key)}
                  />
                ))}
              </div>
            </DropdownMenu>
          )}
        </div>

        {/* More Filters Dropdown - Contact Type */}
        <div ref={moreFiltersRef} style={{ position: 'relative' }}>
          <FilterPill
            icon={<FilterIcon />}
            label="Type"
            isActive={moreFiltersCount > 0}
            onClick={() => setIsMoreFiltersOpen(!isMoreFiltersOpen)}
            hasDropdown
            activeLabel={typeFilter !== 'all' ? TYPE_OPTIONS.find(o => o.key === typeFilter)?.label : undefined}
          />

          {isMoreFiltersOpen && (
            <DropdownMenu width={200}>
              <div style={{ padding: '4px' }}>
                {TYPE_OPTIONS.map(option => (
                  <DropdownRadioItem
                    key={option.key}
                    label={option.label}
                    count={typeCounts ? typeCounts[option.key as keyof typeof typeCounts] : undefined}
                    isSelected={typeFilter === option.key}
                    onClick={() => {
                      onTypeFilterChange?.(option.key);
                      setIsMoreFiltersOpen(false);
                    }}
                  />
                ))}
              </div>
            </DropdownMenu>
          )}
        </div>

        {/* Clear all filters - beside the filter pills, styled to stand out */}
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--accent-primary)',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-subtle)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <CloseIcon size={12} />
            Clear filters
          </button>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Search input - on the right, instant filtering */}
        {onSearchChange && (
          <div style={{ position: 'relative' }}>
            <SearchIcon
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--text-quaternary)',
                width: '14px',
                height: '14px',
              }}
            />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                width: '180px',
                height: '30px',
                paddingLeft: '32px',
                paddingRight: '12px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                outline: 'none',
                transition: 'border-color 150ms ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            />
          </div>
        )}

        {/* AI Settings button */}
        {onAISettings && (
          <button
            onClick={onAISettings}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 500,
              color: hasAiEnabledTag ? 'var(--accent-primary)' : 'var(--text-secondary)',
              background: hasAiEnabledTag ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
              border: `1px solid ${hasAiEnabledTag ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = hasAiEnabledTag ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-secondary)';
              e.currentTarget.style.borderColor = hasAiEnabledTag ? 'var(--accent-primary)' : 'var(--border-default)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = hasAiEnabledTag ? 'rgba(139, 92, 246, 0.08)' : 'transparent';
              e.currentTarget.style.borderColor = hasAiEnabledTag ? 'var(--accent-primary)' : 'var(--border-subtle)';
            }}
          >
            <span style={{ fontSize: '12px' }}>✨</span>
            AI Settings
          </button>
        )}

        {/* Export button */}
        {onExport && (
          <button
            onClick={onExport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }}
          >
            <DownloadIcon size={13} />
            Export
          </button>
        )}
      </div>
    </div>
  );
}

// Large filter box component - Linear style with equal widths
interface FilterBoxProps {
  label: string;
  count: number;
  color?: string | null;
  isSelected: boolean;
  onClick: () => void;
  position: 'first' | 'middle' | 'last';
  totalBoxes: number;
  isCountLoading?: boolean;
}

function FilterBox({
  label,
  count,
  color,
  isSelected,
  onClick,
  position,
  isCountLoading = false,
}: FilterBoxProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate border radius based on position
  const getBorderRadius = () => {
    switch (position) {
      case 'first':
        return '8px 0 0 8px';
      case 'last':
        return '0 8px 8px 0';
      default:
        return '0';
    }
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        padding: '14px 16px',
        minWidth: 0,
        background: isSelected
          ? 'var(--bg-primary)'
          : isHovered
            ? 'var(--bg-secondary)'
            : 'var(--bg-primary)',
        border: 'none',
        borderRadius: getBorderRadius(),
        cursor: 'pointer',
        transition: 'all 120ms ease',
        position: 'relative',
      }}
    >
      {/* Selection indicator - bottom border like Linear */}
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '16px',
            right: '16px',
            height: '2px',
            background: 'var(--accent-primary)',
            borderRadius: '1px 1px 0 0',
          }}
        />
      )}

      {/* Label with optional color dot */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        maxWidth: '100%',
      }}>
        {color && (
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
            }}
          />
        )}
        <span style={{
          fontSize: '12px',
          fontWeight: 500,
          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
      </div>

      {/* Count */}
      {isCountLoading ? (
        <span
          style={{
            width: '32px',
            height: '22px',
            borderRadius: '4px',
            background: 'var(--bg-tertiary)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      ) : (
        <span
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)',
            lineHeight: 1.2,
          }}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

// Filter pill component (for secondary filters) - Linear style with visible borders
interface FilterPillProps {
  icon?: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  hasDropdown?: boolean;
  count?: number;
  isLoading?: boolean;
  activeLabel?: string; // Show this instead of count when active
}

function FilterPill({
  icon,
  label,
  isActive,
  onClick,
  hasDropdown = false,
  count,
  isLoading = false,
  activeLabel,
}: FilterPillProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Linear-style: active filters get purple accent
  const activeStyles = isActive ? {
    color: 'var(--accent-primary)',
    background: 'var(--accent-subtle)',
    borderColor: 'var(--accent-muted, rgba(99, 102, 241, 0.3))',
  } : {};

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={isLoading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        fontSize: '13px',
        fontWeight: 500,
        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
        background: isActive
          ? 'var(--accent-subtle)'
          : isHovered
            ? 'var(--bg-secondary)'
            : 'transparent',
        border: '1px solid',
        borderColor: isActive
          ? 'var(--accent-muted, rgba(99, 102, 241, 0.3))'
          : isHovered
            ? 'var(--border-default)'
            : 'var(--border-subtle)',
        borderRadius: '6px',
        cursor: isLoading ? 'wait' : 'pointer',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
        opacity: isLoading ? 0.7 : 1,
        ...activeStyles,
      }}
    >
      {isLoading ? (
        <LoadingSpinner size={14} />
      ) : (
        icon
      )}
      <span>{label}</span>
      {/* Show active label (e.g., "People") or count badge */}
      {activeLabel ? (
        <span style={{
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--accent-primary)',
        }}>
          {activeLabel}
        </span>
      ) : count && count > 1 ? (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '18px',
          height: '18px',
          padding: '0 5px',
          fontSize: '11px',
          fontWeight: 600,
          color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
          background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-quaternary)',
          borderRadius: '9px',
        }}>
          {count}
        </span>
      ) : null}
      {hasDropdown && <ChevronDownIcon size={12} />}
    </button>
  );
}

// Loading spinner for filter pills
function LoadingSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        animation: 'spin 1s linear infinite',
      }}
    >
      <style>
        {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="32"
        strokeDashoffset="12"
        opacity="0.4"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Dropdown menu component
function DropdownMenu({ children, width = 200 }: { children: React.ReactNode; width?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: '4px',
        minWidth: `${width}px`,
        maxHeight: '400px',
        overflowY: 'auto',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
        zIndex: 100,
      }}
    >
      {children}
    </div>
  );
}

// Dropdown checkbox item component (for multi-select)
interface DropdownCheckboxItemProps {
  label: string;
  count?: number;
  color?: string | null;
  isChecked: boolean;
  onClick: () => void;
}

function DropdownCheckboxItem({ label, count, color, isChecked, onClick }: DropdownCheckboxItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '8px 12px',
        fontSize: '13px',
        color: 'var(--text-primary)',
        background: isHovered ? 'var(--bg-secondary)' : 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 80ms ease',
      }}
    >
      {/* Checkbox */}
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: isChecked ? 'none' : '1.5px solid var(--border-default)',
          background: isChecked ? 'var(--accent-primary)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 120ms ease',
        }}
      >
        {isChecked && <CheckIcon size={12} color="white" />}
      </div>

      {/* Color dot */}
      {color && (
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
      )}

      {/* Label */}
      <span style={{ flex: 1 }}>{label}</span>

      {/* Count */}
      {count !== undefined && (
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

// Dropdown radio item component (for single-select like type filter)
interface DropdownRadioItemProps {
  label: string;
  description?: string;
  count?: number;
  isSelected: boolean;
  onClick: () => void;
}

function DropdownRadioItem({ label, description, count, isSelected, onClick }: DropdownRadioItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '8px 12px',
        fontSize: '13px',
        color: 'var(--text-primary)',
        background: isHovered ? 'var(--bg-secondary)' : 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 80ms ease',
      }}
    >
      {/* Radio */}
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          border: isSelected ? '5px solid var(--accent-primary)' : '1.5px solid var(--border-default)',
          background: 'transparent',
          flexShrink: 0,
          transition: 'all 120ms ease',
        }}
      />

      {/* Label & Description */}
      <div style={{ flex: 1 }}>
        <span>{label}</span>
        {description && (
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '6px' }}>
            {description}
          </span>
        )}
      </div>

      {/* Count */}
      {count !== undefined && (
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

// Icons
function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function ChevronDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SearchIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SearchSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        animation: 'spin 1s linear infinite',
        color: 'var(--text-tertiary)',
      }}
    >
      <style>
        {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="32"
        strokeDashoffset="12"
        opacity="0.4"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
