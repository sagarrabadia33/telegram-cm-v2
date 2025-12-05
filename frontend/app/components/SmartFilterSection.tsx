'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { Contact, Tag } from './ContactsTable';

// ============================================
// SMART FILTER SECTION COMPONENT
// AI-powered filtering with quick filters & insights
// ============================================

// Quick filter definitions
export type QuickFilterType =
  | 'active7d'
  | 'active30d'
  | 'untagged'
  | 'highVolume'
  | 'noReply'
  | 'groupsOnly'
  | 'hasPhone';

const QUICK_FILTERS = [
  { key: 'active7d' as const, label: 'Active 7d', description: 'Active in the last 7 days' },
  { key: 'active30d' as const, label: 'Active 30d', description: 'Active in the last 30 days' },
  { key: 'untagged' as const, label: 'Untagged', description: 'Contacts with no tags' },
  { key: 'highVolume' as const, label: 'High volume', description: '50+ messages' },
  { key: 'noReply' as const, label: 'No reply', description: 'They sent messages but no reply' },
];

// AI Filter criteria returned from API
export interface FilterCriteria {
  lastActiveWithin?: number; // days
  lastActiveOutside?: number; // days
  tags?: string[]; // tag names (empty array = untagged)
  type?: 'private' | 'group' | 'supergroup' | 'channel' | null;
  messageCountMin?: number;
  messageCountMax?: number;
  hasPhone?: boolean;
  hasUsername?: boolean;
  memberCountMin?: number;
  memberCountMax?: number;
}

interface SmartFilterSectionProps {
  contacts: Contact[];
  onFilterChange: (filteredIds: string[] | null, filterDescription?: string) => void;
  availableTags: Tag[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  // Parent can signal to clear filter externally (e.g., when × is clicked in status bar)
  externalClearSignal?: number;
}

export default function SmartFilterSection({
  contacts,
  onFilterChange,
  availableTags,
  isExpanded,
  onToggleExpand,
  externalClearSignal,
}: SmartFilterSectionProps) {
  const [aiQuery, setAiQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilterType | null>(null);
  const [aiFilterDescription, setAiFilterDescription] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(true);

  // Clear filter when parent signals (e.g., when × is clicked in status bar)
  useEffect(() => {
    if (externalClearSignal && externalClearSignal > 0) {
      setAiQuery('');
      setActiveQuickFilter(null);
      setAiFilterDescription(null);
    }
  }, [externalClearSignal]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate quick filter counts (same logic as filters)
  const quickFilterCounts = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      active7d: contacts.filter(c =>
        c.totalMessages > 0 && new Date(c.lastInteraction) >= sevenDaysAgo
      ).length,
      active30d: contacts.filter(c =>
        c.totalMessages > 0 && new Date(c.lastInteraction) >= thirtyDaysAgo
      ).length,
      untagged: contacts.filter(c => !c.tags || c.tags.length === 0).length,
      highVolume: contacts.filter(c => c.totalMessages >= 50).length,
      noReply: contacts.filter(c => c.messagesReceived > 0 && c.messagesSent === 0).length,
      groupsOnly: contacts.filter(c => c.type === 'group' || c.type === 'supergroup').length,
      hasPhone: contacts.filter(c => c.phone !== null).length,
    };
  }, [contacts]);

  // Calculate proactive insights
  const insights = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const untagged = quickFilterCounts.untagged;

    // Need follow-up: they sent last message, you didn't reply in 7+ days
    const needFollowUp = contacts.filter(c => {
      if (c.messagesReceived === 0 || c.messagesSent === 0) return false;
      // Check if last message was received (not sent)
      // For simplicity, use lastInteraction with messagesReceived > messagesSent as proxy
      const lastInteraction = new Date(c.lastInteraction);
      const daysSinceContact = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceContact >= 7 && c.messagesReceived > c.messagesSent;
    }).length;

    // New this week: first contact in last 7 days
    const newThisWeek = contacts.filter(c => {
      const firstContact = new Date(c.firstContactDate);
      return firstContact >= sevenDaysAgo;
    }).length;

    // Highly active: 100+ messages
    const highlyActive = contacts.filter(c => c.totalMessages >= 100).length;

    return { untagged, needFollowUp, newThisWeek, highlyActive };
  }, [contacts, quickFilterCounts.untagged]);

  // Apply quick filter (client-side)
  const applyQuickFilter = useCallback((filterType: QuickFilterType) => {
    const now = new Date();
    let filtered: Contact[];
    let description: string;

    switch (filterType) {
      case 'active7d':
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        // Only count as "active" if they have actual message activity
        filtered = contacts.filter(c =>
          c.totalMessages > 0 && new Date(c.lastInteraction) >= sevenDaysAgo
        );
        description = 'Active in the last 7 days';
        break;
      case 'active30d':
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        // Only count as "active" if they have actual message activity
        filtered = contacts.filter(c =>
          c.totalMessages > 0 && new Date(c.lastInteraction) >= thirtyDaysAgo
        );
        description = 'Active in the last 30 days';
        break;
      case 'untagged':
        filtered = contacts.filter(c => !c.tags || c.tags.length === 0);
        description = 'Contacts with no tags';
        break;
      case 'highVolume':
        filtered = contacts.filter(c => c.totalMessages >= 50);
        description = 'High volume (50+ messages)';
        break;
      case 'noReply':
        filtered = contacts.filter(c => c.messagesReceived > 0 && c.messagesSent === 0);
        description = 'No reply sent';
        break;
      case 'groupsOnly':
        filtered = contacts.filter(c => c.type === 'group' || c.type === 'supergroup');
        description = 'Groups only';
        break;
      case 'hasPhone':
        filtered = contacts.filter(c => c.phone !== null);
        description = 'Has phone number';
        break;
      default:
        filtered = contacts;
        description = '';
    }

    if (activeQuickFilter === filterType) {
      // Toggle off
      setActiveQuickFilter(null);
      setAiFilterDescription(null);
      onFilterChange(null);
    } else {
      setActiveQuickFilter(filterType);
      setAiFilterDescription(description);
      setAiQuery('');
      onFilterChange(filtered.map(c => c.id), description);
    }
  }, [contacts, activeQuickFilter, onFilterChange]);

  // Apply AI filter
  const handleAiFilter = async () => {
    if (!aiQuery.trim()) return;

    setIsLoading(true);
    setActiveQuickFilter(null);

    try {
      const response = await fetch('/api/contacts/smart-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiQuery }),
      });

      if (!response.ok) throw new Error('Failed to parse filter');

      const result = await response.json();

      if (result.success && result.data) {
        const { interpretation, filterCriteria, matchingContactIds } = result.data;
        setAiFilterDescription(interpretation);
        onFilterChange(matchingContactIds, interpretation);
      }
    } catch (error) {
      console.error('AI filter error:', error);
      // Fallback to client-side simple parsing
      const filtered = parseSimpleFilter(aiQuery, contacts);
      setAiFilterDescription(`Searching: "${aiQuery}"`);
      onFilterChange(filtered.map(c => c.id), `Searching: "${aiQuery}"`);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setAiQuery('');
    setActiveQuickFilter(null);
    setAiFilterDescription(null);
    onFilterChange(null);
  };

  // Handle insight click
  const handleInsightClick = (type: 'untagged' | 'needFollowUp' | 'newThisWeek') => {
    switch (type) {
      case 'untagged':
        applyQuickFilter('untagged');
        break;
      case 'needFollowUp':
        // Custom filter for need follow-up
        const now = new Date();
        const filtered = contacts.filter(c => {
          if (c.messagesReceived === 0 || c.messagesSent === 0) return false;
          const lastInteraction = new Date(c.lastInteraction);
          const daysSinceContact = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceContact >= 7 && c.messagesReceived > c.messagesSent;
        });
        setActiveQuickFilter(null);
        setAiFilterDescription('Need follow-up (7+ days)');
        onFilterChange(filtered.map(c => c.id), 'Need follow-up (7+ days)');
        break;
      case 'newThisWeek':
        const sevenDaysAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
        const newContacts = contacts.filter(c => new Date(c.firstContactDate) >= sevenDaysAgo);
        setActiveQuickFilter(null);
        setAiFilterDescription('New this week');
        onFilterChange(newContacts.map(c => c.id), 'New this week');
        break;
    }
  };

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  // Keyboard shortcut: / to focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement instanceof HTMLInputElement ||
                              activeElement instanceof HTMLTextAreaElement;
        if (!isInputFocused) {
          e.preventDefault();
          if (!isExpanded) {
            onToggleExpand();
          }
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, onToggleExpand]);

  const hasActiveFilter = activeQuickFilter !== null || aiFilterDescription !== null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Collapsed State: Just show Ask AI button */}
      {!isExpanded ? (
        <button
          onClick={onToggleExpand}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)';
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
        >
          <SparkleIcon size={14} />
          Ask AI
          <kbd style={{
            fontSize: '10px',
            color: 'var(--text-quaternary)',
            background: 'var(--bg-tertiary)',
            padding: '1px 4px',
            borderRadius: '3px',
            marginLeft: '2px',
          }}>/</kbd>
        </button>
      ) : (
        /* Expanded State: Full Smart Filter Section */
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '12px',
          animation: 'smartFilterExpand 200ms ease-out',
        }}>
          {/* Header Row: Input + Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            {/* AI Input */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              padding: '0 10px',
            }}>
              <SparkleIcon size={14} style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Try: active 30 days, untagged, high volume..."
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && aiQuery.trim()) {
                    handleAiFilter();
                  }
                  if (e.key === 'Escape') {
                    if (aiQuery) {
                      setAiQuery('');
                    } else {
                      onToggleExpand();
                    }
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
              />
              {aiQuery && (
                <button
                  onClick={handleAiFilter}
                  disabled={isLoading}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'white',
                    background: isLoading ? 'var(--text-quaternary)' : 'var(--accent-primary)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'wait' : 'pointer',
                  }}
                >
                  {isLoading ? 'Filtering...' : 'Filter'}
                </button>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={onToggleExpand}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-quaternary)',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <CloseIcon size={14} />
            </button>
          </div>

          {/* Quick Filter Chips */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-quaternary)', marginRight: '2px' }}>
              Quick:
            </span>
            {QUICK_FILTERS.map((filter) => {
              const count = quickFilterCounts[filter.key];
              return (
                <button
                  key={filter.key}
                  onClick={() => applyQuickFilter(filter.key)}
                  title={filter.description}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: activeQuickFilter === filter.key ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                    background: activeQuickFilter === filter.key ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                    border: `1px solid ${activeQuickFilter === filter.key ? 'var(--accent-primary)' : 'transparent'}`,
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (activeQuickFilter !== filter.key) {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeQuickFilter !== filter.key) {
                      e.currentTarget.style.background = 'var(--bg-tertiary)';
                    }
                  }}
                >
                  {filter.label}
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: activeQuickFilter === filter.key ? 'var(--accent-primary)' : 'var(--text-quaternary)',
                    background: activeQuickFilter === filter.key ? 'transparent' : 'var(--bg-secondary)',
                    padding: '1px 5px',
                    borderRadius: '8px',
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Clear filter button */}
            {hasActiveFilter && (
              <button
                onClick={clearFilters}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginLeft: 'auto',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
              >
                Clear
              </button>
            )}
          </div>

          {/* Proactive Insights Row */}
          {showInsights && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>
                <ChartIcon size={12} style={{ marginRight: '4px', verticalAlign: '-2px' }} />
                Insights:
              </span>

              {insights.untagged > 0 && (
                <InsightBadge
                  count={insights.untagged}
                  label="untagged"
                  onClick={() => handleInsightClick('untagged')}
                />
              )}

              {insights.needFollowUp > 0 && (
                <InsightBadge
                  count={insights.needFollowUp}
                  label="need follow-up"
                  onClick={() => handleInsightClick('needFollowUp')}
                />
              )}

              {insights.newThisWeek > 0 && (
                <InsightBadge
                  count={insights.newThisWeek}
                  label="new this week"
                  onClick={() => handleInsightClick('newThisWeek')}
                />
              )}

              {/* Hide insights button */}
              <button
                onClick={() => setShowInsights(false)}
                style={{
                  marginLeft: 'auto',
                  fontSize: '10px',
                  color: 'var(--text-quaternary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                Hide
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

interface InsightBadgeProps {
  count: number;
  label: string;
  onClick: () => void;
}

function InsightBadge({ count, label, onClick }: InsightBadgeProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
        background: 'var(--bg-tertiary)',
        border: 'none',
        borderRadius: '10px',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-tertiary)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      <span style={{ fontWeight: 600 }}>{count}</span>
      <span>{label}</span>
    </button>
  );
}

// Simple client-side filter parser (fallback)
function parseSimpleFilter(query: string, contacts: Contact[]): Contact[] {
  const q = query.toLowerCase();

  // Check for common patterns
  if (q.includes('untagged')) {
    return contacts.filter(c => !c.tags || c.tags.length === 0);
  }

  if (q.includes('active')) {
    const daysMatch = q.match(/(\d+)\s*d/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      // Only count as "active" if they have actual message activity
      return contacts.filter(c => c.totalMessages > 0 && new Date(c.lastInteraction) >= cutoff);
    }
  }

  if (q.includes('high volume') || q.includes('50+') || q.includes('many messages')) {
    return contacts.filter(c => c.totalMessages >= 50);
  }

  if (q.includes('group')) {
    return contacts.filter(c => c.type === 'group' || c.type === 'supergroup');
  }

  if (q.includes('channel')) {
    return contacts.filter(c => c.type === 'channel');
  }

  if (q.includes('phone')) {
    return contacts.filter(c => c.phone !== null);
  }

  // Default: name search
  return contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.username?.toLowerCase().includes(q)
  );
}

// ============================================
// Icons
// ============================================

function SparkleIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path
        d="M8 2L9.5 6.5L14 8L9.5 9.5L8 14L6.5 9.5L2 8L6.5 6.5L8 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function ChartIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M14 12H2V3" />
      <path d="M5 9l3-3 2 2 4-4" />
    </svg>
  );
}
