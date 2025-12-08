'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon } from './Icons';
import { Conversation, ConversationTag } from '../types';
import { formatRelativeTime } from '../lib/utils';
import Tooltip, { RichTooltip, StatusTooltip } from './Tooltip';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  conversationCount?: number;
}

// Special ID for untagged filter
const UNTAGGED_FILTER_ID = '__untagged__';

interface ConversationsListProps {
  conversations: Conversation[];
  allTags: Tag[];  // Tags with counts passed from parent
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  selectedTagIds?: string[];
  onTagFilterChange?: (tagIds: string[]) => void;
  onOpenSearch?: () => void;
  onMarkAsUnread?: (conversationId: string) => void;
}

// Listener status for the "Live" indicator
interface ListenerStatus {
  isRunning: boolean;
  isHealthy: boolean;
  lastHeartbeat: string | null;
}

export default function ConversationsList({
  conversations,
  allTags,  // Use tags from parent instead of fetching
  selectedId,
  onSelect,
  selectedTagIds = [],
  onTagFilterChange,
  onOpenSearch,
  onMarkAsUnread,
}: ConversationsListProps) {
  const [search, setSearch] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filterSearchInputRef = useRef<HTMLInputElement>(null);

  // Listener status for "Live" indicator
  const [listenerStatus, setListenerStatus] = useState<ListenerStatus | null>(null);

  // Poll listener status every 30 seconds
  useEffect(() => {
    const fetchListenerStatus = async () => {
      try {
        const response = await fetch('/api/sync/listener');
        if (response.ok) {
          const data = await response.json();
          setListenerStatus({
            isRunning: data.isRunning,
            isHealthy: data.isHealthy,
            lastHeartbeat: data.lastHeartbeat,
          });
        }
      } catch {
        setListenerStatus(null);
      }
    };

    fetchListenerStatus();
    const interval = setInterval(fetchListenerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter tags based on search
  const filteredTags = useMemo(() => {
    if (!filterSearchQuery.trim()) return allTags;
    const query = filterSearchQuery.toLowerCase();
    return allTags.filter(tag => tag.name.toLowerCase().includes(query));
  }, [allTags, filterSearchQuery]);

  // Calculate dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  // Handle open/close and position updates
  useEffect(() => {
    if (showTagFilter) {
      updateDropdownPosition();
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
    }
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [showTagFilter, updateDropdownPosition]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setShowTagFilter(false);
      }
    };

    if (showTagFilter) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTagFilter]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (showTagFilter) {
      setTimeout(() => filterSearchInputRef.current?.focus(), 50);
      setFilterSearchQuery('');
      setFocusedIndex(0);
    }
  }, [showTagFilter]);

  // Keyboard navigation for filter dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showTagFilter) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setShowTagFilter(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, filteredTags.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredTags[focusedIndex]) {
            toggleTagFilter(filteredTags[focusedIndex].id);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showTagFilter, focusedIndex, filteredTags]);

  // Reset focused index when search changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [filterSearchQuery]);

  const toggleTagFilter = (tagId: string) => {
    const newTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onTagFilterChange?.(newTagIds);
  };

  const clearTagFilters = () => {
    onTagFilterChange?.([]);
    setShowTagFilter(false);
  };

  const filtered = conversations.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header - Linear style with clean spacing */}
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        {/* Top row: Title left, Actions right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          {/* Left: Title only */}
          <h1 style={{
            fontSize: 'var(--title-md)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Messages
          </h1>

          {/* Right: Live indicator + Actions with clear separation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Live status indicator */}
            <LiveIndicator status={listenerStatus} />

            {/* Divider */}
            <div style={{
              width: '1px',
              height: '16px',
              background: 'var(--border-subtle)',
            }} />

            {/* Action buttons group */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Global Search Button - Minimal icon-only style */}
              {onOpenSearch && (
                <RichTooltip title="Search messages" shortcut="⌘K" position="bottom">
                  <button
                    onClick={onOpenSearch}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      padding: 0,
                      color: 'var(--text-tertiary)',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </RichTooltip>
              )}
              {/* Tag Filter Button - Icon only with badge */}
              <Tooltip content="Filter by labels" position="bottom">
              <button
                ref={triggerRef}
                onClick={() => setShowTagFilter(!showTagFilter)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  padding: 0,
                  color: selectedTagIds.length > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  background: selectedTagIds.length > 0 ? 'var(--accent-subtle)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (selectedTagIds.length === 0) {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedTagIds.length === 0) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-tertiary)';
                  }
                }}
              >
                <FilterIcon size={16} />
                {/* Badge */}
                {selectedTagIds.length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    minWidth: '14px',
                    height: '14px',
                    padding: '0 3px',
                    fontSize: '9px',
                    fontWeight: 600,
                    color: 'white',
                    background: 'var(--accent-primary)',
                    borderRadius: '7px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {selectedTagIds.length}
                  </span>
                )}
              </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: 'var(--space-3)', color: 'var(--text-quaternary)', width: '18px', height: '18px' }}
          />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={{
              width: '100%',
              height: '36px',
              paddingLeft: 'var(--space-10)',
              paddingRight: 'var(--space-3)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
              background: 'var(--bg-tertiary)',
              border: `1px solid ${isFocused ? 'var(--accent-primary)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-md)',
              outline: 'none',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
              boxShadow: isFocused ? '0 0 0 2px var(--accent-subtle)' : 'none',
            }}
            className="placeholder:text-[var(--text-quaternary)]"
          />
        </div>

        {/* Active tag filters display */}
        {selectedTagIds.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-1)',
            marginTop: 'var(--space-2)',
          }}>
            {selectedTagIds
              .map((tagId) => allTags.find((t) => t.id === tagId))
              .filter((tag): tag is Tag => tag !== undefined)
              .map((tag) => {
                const isUntagged = tag.id === UNTAGGED_FILTER_ID;
                return (
                  <span
                    key={tag.id}
                    onClick={() => toggleTagFilter(tag.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      fontWeight: 'var(--font-medium)',
                      color: isUntagged ? 'var(--text-tertiary)' : (tag.color || 'var(--text-secondary)'),
                      background: isUntagged ? 'var(--bg-tertiary)' : (tag.color ? `${tag.color}15` : 'var(--bg-hover)'),
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      border: isUntagged ? '1px dashed var(--border-default)' : 'none',
                    }}
                  >
                    {isUntagged ? (
                      <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: 'var(--radius-full)',
                        border: '1px dashed var(--text-quaternary)',
                      }} />
                    ) : (
                      <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: 'var(--radius-full)',
                        background: tag.color || 'var(--text-quaternary)',
                      }} />
                    )}
                    {tag.name}
                    <span style={{ marginLeft: '2px', opacity: 0.6 }}>×</span>
                  </span>
                );
              })}
          </div>
        )}
      </div>

      {/* Conversations List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
              {search ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          filtered.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isSelected={conversation.id === selectedId}
              onClick={() => onSelect(conversation)}
              onMarkAsUnread={onMarkAsUnread}
            />
          ))
        )}
      </div>

      {/* Filter Dropdown Portal */}
      {showTagFilter && typeof window !== 'undefined' && createPortal(
        <FilterDropdown
          dropdownRef={dropdownRef}
          searchInputRef={filterSearchInputRef}
          position={dropdownPosition}
          allTags={filteredTags}
          selectedTagIds={selectedTagIds}
          searchQuery={filterSearchQuery}
          onSearchChange={setFilterSearchQuery}
          focusedIndex={focusedIndex}
          onFocusedIndexChange={setFocusedIndex}
          onToggleTag={toggleTagFilter}
          onClear={clearTagFilters}
          onClose={() => setShowTagFilter(false)}
        />,
        document.body
      )}
    </div>
  );
}

// ============================================
// Filter Dropdown Component (Portal-based) - Linear style
// ============================================

interface FilterDropdownProps {
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  position: { top: number; right: number };
  allTags: Tag[];
  selectedTagIds: string[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  focusedIndex: number;
  onFocusedIndexChange: (index: number) => void;
  onToggleTag: (tagId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

function FilterDropdown({
  dropdownRef,
  searchInputRef,
  position,
  allTags,
  selectedTagIds,
  searchQuery,
  onSearchChange,
  focusedIndex,
  onFocusedIndexChange,
  onToggleTag,
  onClear,
  onClose,
}: FilterDropdownProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
        }}
        onClick={onClose}
      />

      {/* Dropdown */}
      <div
        ref={dropdownRef}
        className="filter-dropdown"
        style={{
          position: 'fixed',
          top: position.top,
          right: position.right,
          width: '280px',
          background: 'var(--bg-elevated, #1a1a1a)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          zIndex: 9999,
          overflow: 'hidden',
          animation: 'filterDropdownEnter 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes filterDropdownEnter {
            from {
              opacity: 0;
              transform: scale(0.95) translateY(-4px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          .filter-dropdown::-webkit-scrollbar {
            width: 6px;
          }
          .filter-dropdown::-webkit-scrollbar-track {
            background: transparent;
          }
          .filter-dropdown::-webkit-scrollbar-thumb {
            background: var(--border-subtle);
            border-radius: 3px;
          }
        `}</style>

        {/* Search input - Linear command palette style */}
        <div style={{
          padding: '12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            border: '1px solid var(--border-default)',
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}>
            <FilterSearchIcon size={15} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Filter labels..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '13px',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '16px',
                  height: '16px',
                  background: 'var(--bg-hover)',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                }}
              >
                <XIcon size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Selected count and clear */}
        {selectedTagIds.length > 0 && (
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
            }}>
              {selectedTagIds.length} selected
            </span>
            <button
              onClick={onClear}
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--accent-primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-subtle, rgba(99, 102, 241, 0.1))'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Tag list */}
        <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '6px' }}>
          {allTags.length > 0 ? (
            allTags.map((tag, index) => {
              const isSelected = selectedTagIds.includes(tag.id);
              const isFocused = focusedIndex === index;
              return (
                <FilterTagRow
                  key={tag.id}
                  tag={tag}
                  isSelected={isSelected}
                  isFocused={isFocused}
                  onClick={() => onToggleTag(tag.id)}
                  onMouseEnter={() => onFocusedIndexChange(index)}
                />
              );
            })
          ) : (
            <FilterEmptyState searchQuery={searchQuery} />
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <FilterKeyboardHint keys={['↑', '↓']} label="navigate" />
          <FilterKeyboardHint keys={['↵']} label="toggle" />
          <FilterKeyboardHint keys={['esc']} label="close" />
        </div>
      </div>
    </>
  );
}

// Search icon for filter
function FilterSearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-quaternary)', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Empty state for filter
function FilterEmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <div style={{
      padding: '32px 16px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        margin: '0 auto 12px',
        background: 'var(--bg-tertiary)',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <FilterSearchIcon size={18} />
      </div>
      <p style={{
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-secondary)',
        margin: '0 0 4px',
      }}>
        {searchQuery ? 'No labels found' : 'No labels yet'}
      </p>
      <p style={{
        fontSize: '12px',
        color: 'var(--text-quaternary)',
        margin: 0,
      }}>
        {searchQuery
          ? `No results for "${searchQuery}"`
          : 'Create labels to filter conversations'
        }
      </p>
    </div>
  );
}

// Keyboard hint for filter
function FilterKeyboardHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '11px',
      color: 'var(--text-quaternary)',
    }}>
      {keys.map((key, i) => (
        <span
          key={i}
          style={{
            padding: '2px 5px',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 500,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {key}
        </span>
      ))}
      <span>{label}</span>
    </div>
  );
}

// ============================================
// Filter Tag Row Component - Linear style
// ============================================

interface FilterTagRowProps {
  tag: Tag;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function FilterTagRow({ tag, isSelected, isFocused, onClick, onMouseEnter }: FilterTagRowProps) {
  const isUntagged = tag.id === UNTAGGED_FILTER_ID;

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: '8px',
        cursor: 'pointer',
        background: isFocused ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 80ms ease',
        position: 'relative',
      }}
    >
      {/* Selection indicator - Linear style left border */}
      {isFocused && (
        <div style={{
          position: 'absolute',
          left: '0',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '2px',
          height: '16px',
          background: 'var(--accent-primary)',
          borderRadius: '1px',
        }} />
      )}

      {/* Checkbox - refined styling */}
      <div style={{
        width: '16px',
        height: '16px',
        borderRadius: '5px',
        border: isSelected ? 'none' : '1.5px solid var(--border-default)',
        background: isSelected ? 'var(--accent-primary)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 120ms cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isSelected ? 'scale(1)' : 'scale(0.95)',
      }}>
        {isSelected && <CheckIcon size={10} color="white" />}
      </div>

      {/* Color indicator - subtle pill style (or dashed border for Untagged) */}
      {isUntagged ? (
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '3px',
          border: '1.5px dashed var(--text-quaternary)',
          flexShrink: 0,
        }} />
      ) : (
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '3px',
          background: tag.color || '#6b7280',
          flexShrink: 0,
          boxShadow: tag.color ? `0 0 6px ${tag.color}40` : 'none',
        }} />
      )}

      {/* Name */}
      <span style={{
        flex: 1,
        fontSize: '13px',
        fontWeight: 500,
        color: isUntagged ? 'var(--text-secondary)' : 'var(--text-primary)',
        letterSpacing: '-0.01em',
        fontStyle: isUntagged ? 'italic' : 'normal',
      }}>
        {tag.name}
      </span>

      {/* Count badge */}
      {tag.conversationCount !== undefined && tag.conversationCount > 0 && (
        <span style={{
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--text-quaternary)',
          padding: '1px 6px',
          background: 'var(--bg-tertiary)',
          borderRadius: '4px',
        }}>
          {tag.conversationCount}
        </span>
      )}
    </div>
  );
}

// ============================================
// Conversation Item
// ============================================

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  onMarkAsUnread?: (conversationId: string) => void;
}

// Telegram-style avatar colors (7 vibrant colors - using hex values for inline styles)
const AVATAR_COLORS = [
  { bg: '#E17076', text: '#FFFFFF' }, // Red
  { bg: '#FAA774', text: '#FFFFFF' }, // Orange
  { bg: '#A695E7', text: '#FFFFFF' }, // Violet
  { bg: '#7BC862', text: '#FFFFFF' }, // Green
  { bg: '#6EC9CB', text: '#FFFFFF' }, // Cyan
  { bg: '#65AADD', text: '#FFFFFF' }, // Blue
  { bg: '#EE7AAE', text: '#FFFFFF' }, // Pink
];

// Get consistent color based on conversation ID (like Telegram)
function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Get 2-letter initials (like Telegram)
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function ConversationItem({ conversation, isSelected, onClick, onMarkAsUnread }: ConversationItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const isGroup = conversation.type === 'group' || conversation.type === 'supergroup';
  const hasAvatar = conversation.avatarUrl && !imageError;

  // Get vibrant color based on conversation ID (like Telegram)
  const avatarColorScheme = getAvatarColor(conversation.id);
  const avatarBg = avatarColorScheme.bg;
  const avatarColor = avatarColorScheme.text;

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleMarkAsUnread = () => {
    if (onMarkAsUnread) {
      onMarkAsUnread(conversation.id);
    }
    setContextMenu(null);
  };

  return (
    <>
    <div
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        transition: 'background 150ms ease',
        marginBottom: 'var(--space-1)',
        background: isSelected
          ? 'var(--bg-tertiary)'
          : isHovered
          ? 'var(--bg-hover)'
          : 'transparent',
      }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {hasAvatar ? (
          // Actual avatar image
          <img
            src={conversation.avatarUrl!.startsWith('/media/')
              ? `/api${conversation.avatarUrl}`
              : conversation.avatarUrl!}
            alt={conversation.name}
            onError={() => setImageError(true)}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-full)',
              objectFit: 'cover',
            }}
          />
        ) : (
          // Fallback: vibrant colored initials or group icon
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-full)',
            background: avatarBg,
            color: avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'var(--font-semibold)',
            fontSize: 'var(--text-md)',
          }}>
            {isGroup ? (
              // Group icon like Telegram
              <GroupIcon style={{ width: '20px', height: '20px' }} />
            ) : (
              // 2-letter initials like Telegram
              getInitials(conversation.name)
            )}
          </div>
        )}
        {/* Online indicator only for private chats */}
        {!isGroup && conversation.online && (
          <div style={{
            position: 'absolute',
            bottom: '2px',
            right: '2px',
            width: '10px',
            height: '10px',
            background: 'var(--success)',
            border: '2px solid var(--bg-secondary)',
            borderRadius: 'var(--radius-full)',
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-1)'
        }}>
          <span style={{
            fontSize: 'var(--text-md)',
            fontWeight: conversation.unread > 0 ? 'var(--font-semibold)' : 'var(--font-medium)',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {conversation.name}
          </span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: conversation.unread > 0 ? '#3390ec' : 'var(--text-quaternary)',
              fontWeight: conversation.unread > 0 ? 500 : 400,
            }}>
              {formatRelativeTime(conversation.time)}
            </span>
            {conversation.unread > 0 && (
              <span style={{
                minWidth: '20px',
                height: '20px',
                padding: '0 6px',
                background: '#3390ec',
                color: 'white',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {conversation.unread > 99 ? '99+' : conversation.unread}
              </span>
            )}
          </div>
        </div>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          margin: 0,
        }}>
          {conversation.lastMessageDirection === 'outbound' && (
            <span style={{ color: 'var(--text-quaternary)' }}>You: </span>
          )}
          {conversation.lastMessage}
        </p>

        {/* Tags display */}
        {conversation.tags && conversation.tags.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: 'var(--space-1-5)',
            flexWrap: 'wrap',
          }}>
            {conversation.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '1px 5px',
                  fontSize: '10px',
                  fontWeight: 'var(--font-medium)',
                  color: tag.color || 'var(--text-tertiary)',
                  background: tag.color ? `${tag.color}15` : 'var(--bg-hover)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: 'var(--radius-full)',
                  background: tag.color || 'var(--text-quaternary)',
                }} />
                {tag.name}
              </span>
            ))}
            {conversation.tags.length > 2 && (
              <span style={{
                fontSize: '10px',
                color: 'var(--text-quaternary)',
              }}>
                +{conversation.tags.length - 2}
              </span>
            )}
          </div>
        )}

      </div>
    </div>

    {/* Context Menu Portal */}
    {contextMenu && typeof window !== 'undefined' && createPortal(
      <div
        style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
          background: 'var(--bg-elevated, #1a1a1a)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          zIndex: 10000,
          minWidth: '160px',
          overflow: 'hidden',
          animation: 'contextMenuEnter 100ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes contextMenuEnter {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <button
          onClick={handleMarkAsUnread}
          style={{
            width: '100%',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 80ms ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <UnreadIcon />
          Mark as unread
        </button>
      </div>,
      document.body
    )}
    </>
  );
}

// Unread icon for context menu
function UnreadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Group icon (like Telegram's group chat icon)
function GroupIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// Filter icon
function FilterIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M2 4h12M4 8h8M6 12h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Check icon
function CheckIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// X icon (close)
function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// Live Status Indicator - Linear style
// ============================================

interface LiveIndicatorProps {
  status: ListenerStatus | null;
}

function LiveIndicator({ status }: LiveIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Determine status state
  const isLive = status?.isRunning && status?.isHealthy;
  const isStale = status?.isRunning && !status?.isHealthy;
  const isOffline = !status?.isRunning;

  // Format heartbeat time
  const formatHeartbeat = (dateString: string | null): string => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);

    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        borderRadius: '12px',
        background: isLive
          ? 'rgba(16, 185, 129, 0.1)'
          : isStale
          ? 'rgba(245, 158, 11, 0.1)'
          : 'rgba(107, 114, 128, 0.1)',
      }}>
        {/* Pulsing dot */}
        <div style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: isLive
            ? '#10b981'
            : isStale
            ? '#f59e0b'
            : '#6b7280',
          animation: isLive ? 'pulse 2s ease-in-out infinite' : 'none',
        }} />
        <span style={{
          fontSize: '11px',
          fontWeight: 500,
          color: isLive
            ? '#10b981'
            : isStale
            ? '#f59e0b'
            : '#6b7280',
          letterSpacing: '0.02em',
        }}>
          {isLive ? 'Live' : isStale ? 'Stale' : 'Offline'}
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated, #1a1a1a)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          padding: '8px 10px',
          minWidth: '140px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
          zIndex: 100,
          animation: 'fadeIn 150ms ease-out',
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: '4px'
          }}>
            Realtime sync
          </div>
          <div style={{
            fontSize: '10px',
            color: 'var(--text-tertiary)'
          }}>
            {isLive
              ? `Heartbeat ${formatHeartbeat(status?.lastHeartbeat || null)}`
              : isStale
              ? `Last heartbeat ${formatHeartbeat(status?.lastHeartbeat || null)}`
              : 'Listener not running'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
