'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { SearchIcon } from './Icons';
import Tooltip from './Tooltip';
import ContactFilterBar, { LastActiveFilter, TypeFilter } from './ContactFilterBar';

// Custom hook for responsive breakpoints
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Contact type from API - re-export for use in other components
export interface Contact {
  id: string;
  externalChatId: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  phone: string | null;
  email: string | null;
  username: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  totalMessages: number;
  messagesReceived: number;
  messagesSent: number;
  memberCount: number | null;
  firstContactDate: string;
  lastInteraction: string;
  lastSyncedAt: string | null;
  tags: { id: string; name: string; color: string | null }[];
  notes: string | null;
  hasMemberData: boolean;
  // AI Conversation Intelligence fields
  aiStatus: string | null; // Now supports any tag-specific status
  aiStatusReason: string | null;
  aiStatusUpdatedAt: string | null;
  aiSummary: string | null;
  aiSummaryUpdatedAt: string | null;
  aiChurnRisk: 'high' | 'medium' | 'low' | null;
  aiChurnSignals: string[] | null;
  aiSuggestedAction: string | null;
  aiAction: 'Reply Now' | 'Schedule Call' | 'Send Resource' | 'Check In' | 'Escalate' | 'On Track' | 'Monitor' | 'Send Intro' | 'Follow Up' | 'Nurture' | null; // AI's action recommendation
  hasAiEnabled: boolean;
  // Real-time analysis state
  aiAnalyzing: boolean;
  aiNeedsUpdate: boolean;
  // Manual status override and AI recommendation
  manualStatus: string | null;
  manualStatusSetAt: string | null;
  aiStatusRecommendation: string | null;
  aiStatusRecommendationReason: string | null;
  // WORLD-CLASS INTELLIGENCE FIELDS
  aiHealthScore: number | null;
  aiHealthFactors: { responsiveness: number; sentiment: number; engagement: number; resolution: number } | null;
  aiLifecycleStage: 'onboarding' | 'active' | 'at_risk' | 'dormant' | 'churning' | null;
  aiUrgencyLevel: 'critical' | 'high' | 'medium' | 'low' | null;
  aiSentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
  aiSentimentTrajectory: 'improving' | 'stable' | 'deteriorating' | 'unknown' | null;
  aiFrustrationSignals: string[] | null;
  aiCriticalInsights: string[] | null;
  // TAG PRIORITY: Which tag was used for AI analysis (for transparency)
  aiAnalyzedTagId: string | null;
  aiAnalyzedTagName: string | null;
}

// All available tags for filtering (includes counts from API)
export interface Tag {
  id: string;
  name: string;
  color: string | null;
  conversationCount?: number; // Total count from database
}

// Telegram-style avatar colors
const AVATAR_COLORS = [
  { bg: '#E17076', text: '#FFFFFF' },
  { bg: '#FAA774', text: '#FFFFFF' },
  { bg: '#A695E7', text: '#FFFFFF' },
  { bg: '#7BC862', text: '#FFFFFF' },
  { bg: '#6EC9CB', text: '#FFFFFF' },
  { bg: '#65AADD', text: '#FFFFFF' },
  { bg: '#EE7AAE', text: '#FFFFFF' },
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

// Last active filter options
const LAST_ACTIVE_FILTERS = [
  { key: 'all', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: '3months', label: 'Last 3 months' },
  { key: 'older', label: 'Older than 3 months' },
] as const;

// AI Status styling and helpers - Linear design system
// Status should be ACTION-ORIENTED: Tell user what to do, not just state
// Now supports any string status (modular for different tag types: Customer, Partner, etc.)
type AiStatus = string;

// ============================================================================
// URGENCY CALCULATION - Smart fallback logic
// Uses AI-extracted days if available, otherwise calculates from lastInteraction
// ============================================================================

// Parse days waiting from status reason (format: "[5d waiting] Summary text...")
function parseDaysWaiting(statusReason: string | null): number | null {
  if (!statusReason) return null;
  const match = statusReason.match(/^\[(\d+)d waiting\]/);
  return match ? parseInt(match[1], 10) : null;
}

// Calculate days since last interaction from ISO date string
function calculateDaysSinceLastInteraction(lastInteraction: string | null): number {
  if (!lastInteraction) return 0;
  const lastDate = new Date(lastInteraction);
  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Get effective days for urgency - uses AI data if available, otherwise calculates
function getEffectiveDaysInactive(contact: {
  aiStatusReason: string | null;
  lastInteraction: string;
  aiStatus: AiStatus | null;
}): number {
  // First try to get AI-extracted days waiting
  const aiDays = parseDaysWaiting(contact.aiStatusReason);
  if (aiDays !== null) return aiDays;

  // Fallback: calculate from lastInteraction (only if status suggests customer waiting)
  if (contact.aiStatus === 'needs_owner' || contact.aiStatus === 'at_risk') {
    return calculateDaysSinceLastInteraction(contact.lastInteraction);
  }

  return 0;
}

// Get clean summary without the days prefix
function getCleanSummary(statusReason: string | null): string {
  if (!statusReason) return '';
  return statusReason.replace(/^\[\d+d waiting\]\s*/, '').trim();
}

// ============================================================================
// LINEAR DESIGN SYSTEM - Urgency Colors
// Red = Critical/Urgent, Orange = Warning, Blue = Active, Green = Good, Gray = Neutral
// ============================================================================

// Urgency-based colors with smart escalation - Linear Design System
function getUrgencyColor(status: AiStatus | null, daysInactive: number): string {
  // Time-based escalation overrides status color
  if (daysInactive >= 7) return '#DC2626'; // Deep red - critical
  if (daysInactive >= 5) return '#EF4444'; // Red - urgent
  if (daysInactive >= 3) return '#F97316'; // Orange - warning

  // Status-based colors (Customer + Partner)
  switch (status) {
    // Customer statuses
    case 'needs_owner':
      return '#EF4444'; // Red - needs Shalin
    case 'at_risk':
      return '#F97316'; // Orange - needs attention
    case 'team_handling':
      return '#3B82F6'; // Blue - in progress
    case 'resolved':
      return '#22C55E'; // Green - complete
    case 'monitoring':
      return '#6B7280'; // Gray - passive
    // Partner statuses - Linear-style vibrant colors
    case 'committed':
      return '#10B981'; // Emerald - locked in
    case 'active':
      return '#3B82F6'; // Blue - engaged
    case 'high_potential':
      return '#8B5CF6'; // Purple - priority
    case 'nurturing':
      return '#F59E0B'; // Amber - warming up
    case 'dormant':
      return '#EF4444'; // Red - needs re-engagement
    default:
      return '#6B7280'; // Gray - default
  }
}

// Background tints for badges (12% opacity versions) - Linear Design System
function getUrgencyBgColor(status: AiStatus | null, daysInactive: number): string {
  if (daysInactive >= 7) return 'rgba(220, 38, 38, 0.12)';
  if (daysInactive >= 5) return 'rgba(239, 68, 68, 0.12)';
  if (daysInactive >= 3) return 'rgba(249, 115, 22, 0.12)';

  switch (status) {
    // Customer statuses
    case 'needs_owner':
      return 'rgba(239, 68, 68, 0.12)';
    case 'at_risk':
      return 'rgba(249, 115, 22, 0.12)';
    case 'team_handling':
      return 'rgba(59, 130, 246, 0.12)';
    case 'resolved':
      return 'rgba(34, 197, 94, 0.12)';
    case 'monitoring':
      return 'rgba(107, 114, 128, 0.08)';
    // Partner statuses
    case 'committed':
      return 'rgba(16, 185, 129, 0.12)'; // Emerald
    case 'active':
      return 'rgba(59, 130, 246, 0.12)'; // Blue
    case 'high_potential':
      return 'rgba(139, 92, 246, 0.12)'; // Purple
    case 'nurturing':
      return 'rgba(245, 158, 11, 0.12)'; // Amber
    case 'dormant':
      return 'rgba(239, 68, 68, 0.12)'; // Red
    default:
      return 'rgba(107, 114, 128, 0.08)';
  }
}

// ============================================================================
// STATUS LABELS - Human-readable status names
// ============================================================================

function getStatusLabel(status: AiStatus | null): string {
  if (!status) return 'Review';

  // Status label mapping (supports both Customer and Partner statuses)
  const statusLabels: Record<string, string> = {
    // Customer statuses
    needs_owner: 'Needs Owner',
    at_risk: 'At Risk',
    team_handling: 'Team Handling',
    resolved: 'Resolved',
    monitoring: 'Monitoring',
    // Partner statuses
    nurturing: 'Nurturing',
    high_potential: 'High Potential',
    active: 'Active',
    dormant: 'Dormant',
    committed: 'Committed',
  };

  return statusLabels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================================================
// ACTION LABELS - Tell user what to DO (used in badge display)
// PRIORITY: Use AI's actual action recommendation when available
// ============================================================================

type AiAction = 'Reply Now' | 'Schedule Call' | 'Send Resource' | 'Check In' | 'Escalate' | 'On Track' | 'Monitor' | 'Send Intro' | 'Follow Up' | 'Nurture' | null;

// Get action label from AI's recommendation (preferred) or fallback to status-based
function getActionLabelFromAI(aiAction: AiAction, status: AiStatus | null, daysInactive: number): string {
  // PRIORITY 1: Use AI's actual action recommendation if available
  if (aiAction) {
    return aiAction; // "Reply Now", "Schedule Call", "Send Resource", etc.
  }

  // PRIORITY 2: Time-based urgency when no AI recommendation
  if (daysInactive >= 7) return 'Reply now';
  if (daysInactive >= 5) return 'Follow up';
  if (daysInactive >= 3) return 'Check in';

  // PRIORITY 3: Status-based fallback (for conversations without AI analysis)
  switch (status) {
    case 'needs_owner':
      return 'Escalate';
    case 'at_risk':
      return 'Follow up';
    case 'team_handling':
      return 'In progress';
    case 'resolved':
      return 'On track';
    case 'monitoring':
      return 'Monitor';
    // Partner statuses
    case 'nurturing':
      return 'Nurture';
    case 'high_potential':
      return 'Prioritize';
    case 'active':
      return 'Maintain';
    case 'dormant':
      return 'Re-engage';
    case 'committed':
      return 'Support';
    default:
      return 'Review';
  }
}

// Legacy function - kept for backward compatibility but now just wraps the new function
function getActionLabel(status: AiStatus | null, daysInactive: number): string {
  return getActionLabelFromAI(null, status, daysInactive);
}

// Get urgency level for styling decisions
// PRIORITY: Use AI's actual urgency level when available
function getUrgencyLevelFromAI(
  aiUrgency: 'critical' | 'high' | 'medium' | 'low' | null,
  aiAction: AiAction,
  status: AiStatus | null,
  daysInactive: number
): 'critical' | 'high' | 'medium' | 'low' {
  // PRIORITY 1: Use AI's actual urgency level if available
  if (aiUrgency) {
    return aiUrgency;
  }

  // PRIORITY 2: Derive urgency from AI action
  if (aiAction) {
    switch (aiAction) {
      case 'Reply Now':
      case 'Escalate':
        return 'critical';
      case 'Schedule Call':
      case 'Follow Up':
        return 'high';
      case 'Send Resource':
      case 'Check In':
      case 'Send Intro':
        return 'medium';
      case 'On Track':
      case 'Monitor':
      case 'Nurture':
        return 'low';
    }
  }

  // PRIORITY 3: Fallback to legacy logic
  if (daysInactive >= 7 || status === 'needs_owner') return 'critical';
  if (daysInactive >= 5 || status === 'at_risk') return 'high';
  if (daysInactive >= 3) return 'medium';
  return 'low';
}

// Legacy function - kept for backward compatibility
function getUrgencyLevel(status: AiStatus | null, daysInactive: number): 'critical' | 'high' | 'medium' | 'low' {
  return getUrgencyLevelFromAI(null, null, status, daysInactive);
}

// Legacy functions for backwards compatibility
function getAiStatusColor(status: AiStatus): string {
  return getUrgencyColor(status, 0);
}

function getAiStatusLabel(status: AiStatus): string {
  return getActionLabel(status, 0);
}

// Priority level for sorting (1 = highest priority)
function getAiStatusPriority(status: AiStatus): number {
  switch (status) {
    // Customer statuses
    case 'needs_owner':
      return 1;
    case 'at_risk':
      return 2;
    case 'team_handling':
      return 3;
    case 'monitoring':
      return 4;
    case 'resolved':
      return 5;
    // Partner statuses - sort by engagement potential
    case 'dormant':
      return 1; // Needs attention
    case 'high_potential':
      return 2; // Worth pursuing
    case 'nurturing':
      return 3; // Building
    case 'active':
      return 4; // Healthy
    case 'committed':
      return 5; // Locked in
    default:
      return 6;
  }
}

// Partner-specific color based on urgency level (for action display)
function getPartnerUrgencyColor(urgencyLevel: 'critical' | 'high' | 'medium' | 'low'): string {
  switch (urgencyLevel) {
    case 'critical': return '#DC2626'; // Red
    case 'high': return '#F97316'; // Orange
    case 'medium': return '#3B82F6'; // Blue
    case 'low': return '#22C55E'; // Green
  }
}

function getPartnerUrgencyBgColor(urgencyLevel: 'critical' | 'high' | 'medium' | 'low'): string {
  switch (urgencyLevel) {
    case 'critical': return 'rgba(220, 38, 38, 0.12)';
    case 'high': return 'rgba(249, 115, 22, 0.12)';
    case 'medium': return 'rgba(59, 130, 246, 0.12)';
    case 'low': return 'rgba(34, 197, 94, 0.12)';
  }
}

// Re-export LastActiveFilter from ContactFilterBar for consistency
// (Used for type-checking the local LAST_ACTIVE_FILTERS array)
type LocalLastActiveFilter = typeof LAST_ACTIVE_FILTERS[number]['key'];

type SortKey = 'name' | 'type' | 'lastInteraction' | 'memberCount' | 'phone' | 'aiStatus';
type SortDirection = 'asc' | 'desc';

// Quick filter counts from server (accurate totals)
interface QuickFilterCounts {
  active7d: number;
  active30d: number;
  untagged: number;
  highVolume: number;
  newThisWeek: number;
  needFollowUp?: number;
}

// QuickFilterType - simplified since SmartFilterSection was removed
type QuickFilterType = 'active7d' | 'active30d' | 'untagged' | 'highVolume' | 'newThisWeek' | 'needFollowUp' | 'noReply';

interface ContactsTableProps {
  contacts: Contact[];
  onSelect: (contact: Contact) => void;
  typeFilter?: TypeFilter; // Contact type filter
  onTypeFilterChange?: (type: TypeFilter) => void;
  counts: { all: number; people: number; groups: number; channels: number }; // Filtered counts for Type dropdown
  unfilteredTotalCount?: number | null; // Unfiltered total for "All" primary box
  quickFilterCounts?: QuickFilterCounts; // Server-calculated accurate counts
  onExportCsv?: () => void;
  allTags?: Tag[];
  onTagsChange?: (contactId: string, tags: { id: string; name: string; color: string | null }[]) => void;
  onBulkTagsChange?: (contactIds: string[], tags: { id: string; name: string; color: string | null }[]) => void;
  isLoading?: boolean; // Initial load only - shows skeleton
  isFiltering?: boolean; // True when filter is being applied (shows subtle overlay)
  // Infinite scroll props
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onSearch?: (search: string) => void;
  isSearching?: boolean; // Subtle indicator during search (no skeleton)
  // Server-side quick filter support
  onQuickFilterChange?: (filterType: QuickFilterType | null) => void;
  activeQuickFilter?: QuickFilterType | null;
  // Unified filter bar (tags + last active) - supports multi-select
  activeTagFilters?: string[]; // Changed to array for multi-select
  onTagFilterChange?: (tagIds: string[]) => void; // Changed to accept array
  lastActiveFilters?: LastActiveFilter[]; // Changed to array for multi-select
  onLastActiveFiltersChange?: (filters: LastActiveFilter[]) => void; // Changed to accept array
  // AI Settings
  onAISettings?: () => void;
  hasAiEnabledTag?: boolean;
}

export default function ContactsTable({
  contacts,
  onSelect,
  typeFilter = 'all',
  onTypeFilterChange,
  counts,
  unfilteredTotalCount,
  quickFilterCounts,
  onExportCsv,
  allTags = [],
  onTagsChange,
  onBulkTagsChange,
  isLoading = false,
  isFiltering = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onSearch,
  isSearching = false,
  onQuickFilterChange,
  activeQuickFilter,
  activeTagFilters = [],
  onTagFilterChange,
  lastActiveFilters: propLastActiveFilters,
  onLastActiveFiltersChange,
  onAISettings,
  hasAiEnabledTag = false,
}: ContactsTableProps) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastInteraction');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  // Use prop if provided, otherwise use local state (for backward compatibility)
  const [localLastActiveFilters, setLocalLastActiveFilters] = useState<LastActiveFilter[]>(['all']);
  const lastActiveFilters = propLastActiveFilters ?? localLastActiveFilters;
  const setLastActiveFilters = onLastActiveFiltersChange ?? setLocalLastActiveFilters;
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isLastActiveDropdownOpen, setIsLastActiveDropdownOpen] = useState(false);

  // Multi-select state
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isBulkTagDropdownOpen, setIsBulkTagDropdownOpen] = useState(false);
  const [bulkTagSearchQuery, setBulkTagSearchQuery] = useState('');
  const [isCreatingBulkTag, setIsCreatingBulkTag] = useState(false);
  const [newBulkTagName, setNewBulkTagName] = useState('');
  const bulkTagDropdownRef = useRef<HTMLDivElement>(null);
  const bulkTagSearchInputRef = useRef<HTMLInputElement>(null);
  const newBulkTagInputRef = useRef<HTMLInputElement>(null);

  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const lastActiveDropdownRef = useRef<HTMLDivElement>(null);

  // Infinite scroll refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore, isLoading]);

  // INSTANT SEARCH: Pure client-side filtering for fast response
  // For datasets under 1000 contacts, client-side is faster than any server call
  // No debounce needed - filtering is instant

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setIsTagDropdownOpen(false);
      }
      if (lastActiveDropdownRef.current && !lastActiveDropdownRef.current.contains(e.target as Node)) {
        setIsLastActiveDropdownOpen(false);
      }
      if (bulkTagDropdownRef.current && !bulkTagDropdownRef.current.contains(e.target as Node)) {
        setIsBulkTagDropdownOpen(false);
        setBulkTagSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus bulk tag search when dropdown opens
  useEffect(() => {
    if (isBulkTagDropdownOpen) {
      setTimeout(() => bulkTagSearchInputRef.current?.focus(), 10);
    }
  }, [isBulkTagDropdownOpen]);

  // Clear selection when contacts change (e.g., type filter changes)
  useEffect(() => {
    setSelectedContactIds(new Set());
  }, [typeFilter]);

  // Get unique tags from contacts if allTags not provided
  const availableTags = useMemo(() => {
    if (allTags.length > 0) return allTags;
    const tagMap = new Map<string, Tag>();
    contacts.forEach(c => {
      c.tags?.forEach(t => {
        if (!tagMap.has(t.id)) {
          tagMap.set(t.id, t);
        }
      });
    });
    return Array.from(tagMap.values());
  }, [contacts, allTags]);

  // Filter by search
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return contacts;
    const query = search.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.username?.toLowerCase().includes(query) ||
      c.phone?.includes(query)
    );
  }, [contacts, search]);

  // Filter by tags - NOW SERVER-SIDE via TagFilterBar (multi-select)
  // Previously filtered client-side, now server handles tag filtering
  // We keep this memo for backward compatibility with client-side selectedTagIds if still used
  const tagFiltered = useMemo(() => {
    // If server-side tag filter is active (via activeTagFilters), don't filter client-side
    if (activeTagFilters.length > 0) return searchFiltered;
    // Legacy client-side filtering (kept for backward compatibility)
    if (selectedTagIds.length === 0) return searchFiltered;
    return searchFiltered.filter(c =>
      c.tags?.some(t => selectedTagIds.includes(t.id))
    );
  }, [searchFiltered, selectedTagIds, activeTagFilters]);

  // Filter by last active (now supports multi-select - OR logic)
  const lastActiveFiltered = useMemo(() => {
    // If 'all' is selected or no filters, show everything
    if (lastActiveFilters.includes('all') || lastActiveFilters.length === 0) return tagFiltered;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsStart = new Date(todayStart.getTime() - 90 * 24 * 60 * 60 * 1000);

    return tagFiltered.filter(c => {
      const lastActive = new Date(c.lastInteraction);
      // OR logic: contact matches if it matches ANY of the selected filters
      return lastActiveFilters.some(filter => {
        switch (filter) {
          case 'today':
            return lastActive >= todayStart;
          case 'week':
            return lastActive >= weekStart;
          case 'month':
            return lastActive >= monthStart;
          case '3months':
            return lastActive >= threeMonthsStart;
          case 'older':
            return lastActive < threeMonthsStart;
          default:
            return true;
        }
      });
    });
  }, [tagFiltered, lastActiveFilters]);

  // Sort contacts
  const sorted = useMemo(() => {
    return [...lastActiveFiltered].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'lastInteraction':
          comparison = new Date(a.lastInteraction).getTime() - new Date(b.lastInteraction).getTime();
          break;
        case 'memberCount':
          comparison = (a.memberCount || 0) - (b.memberCount || 0);
          break;
        case 'phone':
          comparison = (a.phone || '').localeCompare(b.phone || '');
          break;
        case 'aiStatus':
          // Sort by priority (1 = highest priority, needs action first)
          const priorityA = a.aiStatus ? getAiStatusPriority(a.aiStatus) : 99;
          const priorityB = b.aiStatus ? getAiStatusPriority(b.aiStatus) : 99;
          comparison = priorityA - priorityB;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [lastActiveFiltered, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const clearTagFilters = () => {
    setSelectedTagIds([]);
    setIsTagDropdownOpen(false);
  };

  // Multi-select handlers
  const toggleSelectContact = (contactId: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedContactIds.size === sorted.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(sorted.map(c => c.id)));
    }
  };

  const clearSelection = () => {
    setSelectedContactIds(new Set());
  };

  // Filter tags for bulk dropdown
  const filteredBulkTags = useMemo(() => {
    if (!bulkTagSearchQuery.trim()) return availableTags;
    const query = bulkTagSearchQuery.toLowerCase();
    return availableTags.filter(tag => tag.name.toLowerCase().includes(query));
  }, [availableTags, bulkTagSearchQuery]);

  // Handle bulk tag assignment
  // Logic: If ALL selected contacts have the tag -> remove from ALL
  //        If SOME or NONE have the tag -> ADD to ALL (ensures consistent state)
  const handleBulkTagToggle = async (tag: Tag) => {
    if (!onBulkTagsChange || selectedContactIds.size === 0) return;

    const selectedIds = Array.from(selectedContactIds);
    const selectedContacts = contacts.filter(c => selectedIds.includes(c.id));

    // Check if all selected contacts have this tag
    const allHaveTag = selectedContacts.every(c => c.tags?.some(t => t.id === tag.id));

    // Build new tags for each contact
    selectedContacts.forEach(contact => {
      const currentTags = contact.tags || [];
      let newTags;
      if (allHaveTag) {
        // ALL have it -> remove tag from all
        newTags = currentTags.filter(t => t.id !== tag.id);
      } else {
        // SOME or NONE have it -> add tag to ALL (even if they already have it, ensure consistent state)
        if (!currentTags.some(t => t.id === tag.id)) {
          newTags = [...currentTags, { id: tag.id, name: tag.name, color: tag.color }];
        } else {
          // Already has the tag, keep current tags
          newTags = currentTags;
        }
      }
      // Call onBulkTagsChange for each contact (optimistic update)
      onBulkTagsChange([contact.id], newTags);
    });
  };

  // Create a new tag and assign to all selected contacts
  const createBulkTag = async (tagName: string) => {
    if (!tagName.trim() || !onBulkTagsChange || selectedContactIds.size === 0) return;

    try {
      // Generate a random color from AVATAR_COLORS (use .bg which is the hex string)
      const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)].bg;

      // Create the tag via API
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tagName.trim(),
          color: randomColor,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create tag');
      }

      const result = await response.json();
      const newTag = result.data;

      // Assign to all selected contacts
      const selectedIds = Array.from(selectedContactIds);
      const selectedContacts = contacts.filter(c => selectedIds.includes(c.id));

      selectedContacts.forEach(contact => {
        const currentTags = contact.tags || [];
        const newTags = [...currentTags, { id: newTag.id, name: newTag.name, color: newTag.color }];
        onBulkTagsChange([contact.id], newTags);
      });

      // Reset state
      setNewBulkTagName('');
      setIsCreatingBulkTag(false);
      setBulkTagSearchQuery('');
    } catch (error) {
      console.error('Failed to create bulk tag:', error);
    }
  };

  const SortIcon = ({ active, direction }: { active: boolean; direction: SortDirection }) => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      style={{
        marginLeft: '4px',
        opacity: active ? 1 : 0.3,
        transition: 'opacity 150ms ease',
      }}
    >
      <path
        d={direction === 'asc' ? 'M6 3L10 7H2L6 3Z' : 'M6 9L2 5H10L6 9Z'}
        fill="currentColor"
      />
    </svg>
  );

  // Determine which columns to show based on type filter
  const showPhoneColumn = typeFilter === 'people';
  const showMembersColumn = typeFilter === 'groups' || typeFilter === 'channels';

  // Check if any filters are active (hide bulk selection when filtered)
  const hasActiveFilters = activeTagFilters.length > 0 ||
    !lastActiveFilters.includes('all') ||
    typeFilter !== 'all' ||
    (search && search.length > 0);

  // Show AI columns ONLY when:
  // 1. A tag filter is active (user has filtered by at least one tag)
  // 2. AND some contacts in the filtered list have AI enabled
  const showAiColumns = useMemo(() => {
    if (activeTagFilters.length === 0) return false;
    return contacts.some(c => c.hasAiEnabled);
  }, [contacts, activeTagFilters]);

  // Tags for filter bar (single-select) - use server counts
  const tagsForFilterBar = useMemo(() => {
    return allTags.map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      conversationCount: tag.conversationCount || 0,
    }));
  }, [allTags]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Unified Filter Bar (Tags + Last Active + More Filters + Search + Export) - Linear style */}
      {onTagFilterChange && !isMobile && (
        <ContactFilterBar
          tags={tagsForFilterBar}
          selectedTagIds={activeTagFilters}
          onTagSelect={onTagFilterChange}
          totalCount={unfilteredTotalCount ?? counts.all} // Use unfiltered for "All" box, fallback to filtered
          lastActiveFilters={lastActiveFilters}
          onLastActiveChange={setLastActiveFilters}
          typeFilter={typeFilter}
          onTypeFilterChange={onTypeFilterChange}
          typeCounts={counts} // Filtered counts for Type dropdown
          isLoading={isFiltering}
          isCountsLoading={isLoading && unfilteredTotalCount === null} // Show skeleton during initial load
          // Search props
          search={search}
          onSearchChange={setSearch}
          isSearching={isSearching}
          // Export props
          onExport={onExportCsv}
          // AI Settings props
          onAISettings={onAISettings}
          hasAiEnabledTag={hasAiEnabledTag}
        />
      )}

      {/* Mobile header with search */}
      {isMobile && (
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div className="relative">
            {isSearching ? (
              <div
                className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: '10px' }}
              >
                <InlineSpinner size={14} />
              </div>
            ) : (
              <SearchIcon
                className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: '10px', color: 'var(--text-quaternary)', width: '14px', height: '14px' }}
              />
            )}
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: '36px',
                paddingLeft: '32px',
                paddingRight: '12px',
                fontSize: '14px',
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                outline: 'none',
              }}
              className="placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent-primary)]"
            />
          </div>
        </div>
      )}

      {/* Bulk Actions Toolbar - Linear style */}
      {selectedContactIds.size > 0 && (
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--accent-subtle)',
        }}>
          {/* Selection count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--accent-primary)',
            }}>
              {selectedContactIds.size} selected
            </span>
            <button
              onClick={clearSelection}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              <CloseIcon size={10} />
              Clear
            </button>
          </div>

          {/* Separator */}
          <div style={{ width: '1px', height: '20px', background: 'var(--border-default)' }} />

          {/* Bulk Tag Assignment */}
          <div ref={bulkTagDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setIsBulkTagDropdownOpen(!isBulkTagDropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              <TagIcon size={13} />
              Add labels
              <ChevronDownIcon size={10} />
            </button>

            {isBulkTagDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  width: '240px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  zIndex: 100,
                }}
              >
                {/* Search Input */}
                <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <input
                    ref={bulkTagSearchInputRef}
                    type="text"
                    placeholder="Search labels..."
                    value={bulkTagSearchQuery}
                    onChange={(e) => setBulkTagSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsBulkTagDropdownOpen(false);
                        setBulkTagSearchQuery('');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '4px',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Info text */}
                <div style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-secondary)',
                }}>
                  Toggle labels for {selectedContactIds.size} contact{selectedContactIds.size !== 1 ? 's' : ''}
                </div>

                {/* Tag list */}
                <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
                  {filteredBulkTags.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                      No labels found
                    </div>
                  ) : (
                    filteredBulkTags.map((tag) => {
                      // Check how many selected contacts have this tag
                      const selectedContacts = contacts.filter(c => selectedContactIds.has(c.id));
                      const countWithTag = selectedContacts.filter(c => c.tags?.some(t => t.id === tag.id)).length;
                      const allHave = countWithTag === selectedContacts.length;
                      const someHave = countWithTag > 0 && countWithTag < selectedContacts.length;

                      return (
                        <button
                          key={tag.id}
                          onClick={() => handleBulkTagToggle(tag)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '8px',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '3px',
                              border: allHave ? 'none' : '1px solid var(--border-default)',
                              background: allHave ? 'var(--accent-primary)' : someHave ? 'var(--bg-tertiary)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {allHave && <CheckIcon size={10} color="white" />}
                            {someHave && <MinusIcon size={10} />}
                          </span>
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: tag.color || 'var(--text-quaternary)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tag.name}
                          </span>
                          {countWithTag > 0 && (
                            <span style={{ fontSize: '10px', color: 'var(--text-quaternary)' }}>
                              {countWithTag}/{selectedContacts.length}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Create new label section */}
                {!isCreatingBulkTag ? (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '4px' }}>
                    <button
                      onClick={() => {
                        setIsCreatingBulkTag(true);
                        setTimeout(() => newBulkTagInputRef.current?.focus(), 10);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--accent-primary)',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <PlusIcon size={12} />
                      Create new label
                    </button>
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                      NEW LABEL
                    </div>
                    <input
                      ref={newBulkTagInputRef}
                      type="text"
                      placeholder="Label name"
                      value={newBulkTagName}
                      onChange={(e) => setNewBulkTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newBulkTagName.trim()) {
                          createBulkTag(newBulkTagName);
                        } else if (e.key === 'Escape') {
                          setIsCreatingBulkTag(false);
                          setNewBulkTagName('');
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '4px',
                        outline: 'none',
                        marginBottom: '8px',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          setIsCreatingBulkTag(false);
                          setNewBulkTagName('');
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          color: 'var(--text-tertiary)',
                          background: 'transparent',
                          border: '1px solid var(--border-default)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => newBulkTagName.trim() && createBulkTag(newBulkTagName)}
                        disabled={!newBulkTagName.trim()}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 500,
                          color: newBulkTagName.trim() ? 'white' : 'var(--text-quaternary)',
                          background: newBulkTagName.trim() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: newBulkTagName.trim() ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Create
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile List View */}
      {isMobile ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* WORLD-CLASS UX: Only show skeleton on true initial load (no data ever loaded) */}
          {isLoading && contacts.length === 0 ? (
            <MobileLoadingState />
          ) : sorted.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              {search || activeTagFilters.length > 0 || !lastActiveFilters.includes('all') || typeFilter !== 'all' ? (
                'No contacts match your filters'
              ) : (
                'No contacts yet'
              )}
            </div>
          ) : (
            <>
              {sorted.map((contact) => (
                <MobileContactCard
                  key={contact.id}
                  contact={contact}
                  onClick={() => onSelect(contact)}
                  isSelected={selectedContactIds.has(contact.id)}
                  onToggleSelect={() => toggleSelectContact(contact.id)}
                />
              ))}
              {/* 100x RELIABLE: Fixed height container for mobile loading indicator */}
              <div
                ref={loadMoreTriggerRef}
                style={{
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  visibility: hasMore || isLoadingMore ? 'visible' : 'hidden',
                }}
              >
                {isLoadingMore ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <InlineSpinner />
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Loading more...</span>
                  </div>
                ) : hasMore ? (
                  <span style={{ fontSize: '12px', color: 'transparent' }}>Loading more...</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Desktop Table View */
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {/* Filtering overlay - Linear style */}
          {isFiltering && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'var(--bg-primary)',
                opacity: 0.6,
                zIndex: 20,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '100px',
                pointerEvents: 'none',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                <InlineSpinner size={16} />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Filtering...</span>
              </div>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-subtle)',
                zIndex: 10,
              }}>
                {/* Checkbox column - only show when no filters active */}
                {!hasActiveFilters && (
                  <th style={{ ...thStyle, width: '40px', paddingLeft: '12px' }}>
                    <button
                      onClick={toggleSelectAll}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '16px',
                        height: '16px',
                        padding: 0,
                        background: selectedContactIds.size === sorted.length && sorted.length > 0
                          ? 'var(--accent-primary)'
                          : selectedContactIds.size > 0
                            ? 'var(--bg-tertiary)'
                            : 'transparent',
                        border: selectedContactIds.size === sorted.length && sorted.length > 0
                          ? 'none'
                          : '1px solid var(--border-default)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      {selectedContactIds.size === sorted.length && sorted.length > 0 && (
                        <CheckIcon size={10} color="white" />
                      )}
                      {selectedContactIds.size > 0 && selectedContactIds.size < sorted.length && (
                        <MinusIcon size={10} />
                      )}
                    </button>
                  </th>
                )}

                {/* Name column */}
                <th style={{
                  ...thStyle,
                  width: showAiColumns ? '200px' : (typeFilter === 'all' ? '25%' : '30%'),
                  minWidth: '150px',
                  paddingLeft: hasActiveFilters ? '24px' : '16px'
                }}>
                  <button onClick={() => handleSort('name')} style={thButtonStyle}>
                    Name
                    <SortIcon active={sortKey === 'name'} direction={sortDirection} />
                  </button>
                </th>

                {/* Type column - show for Partner view (has mix of private/group) OR when no AI columns */}
                {(typeFilter === 'all' && !showAiColumns) || (showAiColumns && activeTagFilters.length === 1 && availableTags.find(t => t.id === activeTagFilters[0])?.name === 'Partner') ? (
                  <th style={{ ...thStyle, width: '70px' }}>
                    <button onClick={() => handleSort('type')} style={thButtonStyle}>
                      Type
                      <SortIcon active={sortKey === 'type'} direction={sortDirection} />
                    </button>
                  </th>
                ) : null}

                {/* Username - hide when AI columns are shown (groups don't have usernames) */}
                {!showAiColumns && (
                  <th style={{ ...thStyle, width: '120px' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>Username</span>
                  </th>
                )}

                {/* Phone - only for People */}
                {showPhoneColumn && (
                  <th style={{ ...thStyle, width: '120px' }}>
                    <button onClick={() => handleSort('phone')} style={thButtonStyle}>
                      Phone
                      <SortIcon active={sortKey === 'phone'} direction={sortDirection} />
                    </button>
                  </th>
                )}

                {/* Members - only for Groups/Channels */}
                {showMembersColumn && (
                  <th style={{ ...thStyle, width: '90px' }}>
                    <button onClick={() => handleSort('memberCount')} style={thButtonStyle}>
                      Members
                      <SortIcon active={sortKey === 'memberCount'} direction={sortDirection} />
                    </button>
                  </th>
                )}

                {/* Tags column - tighter in AI view */}
                <th style={{ ...thStyle, width: showAiColumns ? '120px' : '150px' }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}>Tags</span>
                </th>

                {/* AI Action/Status column - "Action" for Customers/Groups, "Status" for Partners */}
                {showAiColumns && (
                  <th style={{ ...thStyle, width: '120px' }}>
                    <button onClick={() => handleSort('aiStatus')} style={thButtonStyle}>
                      {activeTagFilters.length === 1 && availableTags.find(t => t.id === activeTagFilters[0])?.name === 'Partner' ? 'Status' : 'Action'}
                      <SortIcon active={sortKey === 'aiStatus'} direction={sortDirection} />
                    </button>
                  </th>
                )}

                {/* AI Summary column - wider for readability */}
                {showAiColumns && (
                  <th style={{ ...thStyle, width: '320px' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>Summary</span>
                  </th>
                )}

                {/* Last Active */}
                <th style={{ ...thStyle, width: showAiColumns ? '90px' : '100px' }}>
                  <button onClick={() => handleSort('lastInteraction')} style={thButtonStyle}>
                    Last Active
                    <SortIcon active={sortKey === 'lastInteraction'} direction={sortDirection} />
                  </button>
                </th>

                {/* Chevron column */}
                <th style={{ ...thStyle, width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {/* Show skeleton rows during initial load */}
              {isLoading && contacts.length === 0 ? (
                [...Array(8)].map((_, i) => (
                  <SkeletonTableRow
                    key={i}
                    showCheckbox={!hasActiveFilters}
                    showTypeColumn={typeFilter === 'all'}
                    showPhoneColumn={showPhoneColumn}
                    showMembersColumn={showMembersColumn}
                    showAiColumns={showAiColumns}
                  />
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={showAiColumns ? 9 : 8}
                    style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)' }}
                  >
                    No contacts found
                  </td>
                </tr>
              ) : (
                sorted.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    onClick={() => onSelect(contact)}
                    typeFilter={typeFilter}
                    showPhoneColumn={showPhoneColumn}
                    showMembersColumn={showMembersColumn}
                    showAiColumns={showAiColumns}
                    availableTags={availableTags}
                    onTagsChange={onTagsChange}
                    isSelected={selectedContactIds.has(contact.id)}
                    onToggleSelect={() => toggleSelectContact(contact.id)}
                    showCheckbox={!hasActiveFilters}
                    isPartnerView={activeTagFilters.length === 1 && availableTags.find(t => t.id === activeTagFilters[0])?.name === 'Partner'}
                  />
                ))
              )}
            </tbody>
          </table>

          {/* Fixed-height load more container to avoid layout shift */}
          <div
            ref={loadMoreTriggerRef}
            style={{
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              visibility: hasMore || isLoadingMore ? 'visible' : 'hidden',
            }}
          >
            {isLoadingMore ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <InlineSpinner />
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Loading more contacts...</span>
              </div>
            ) : hasMore ? (
              <span style={{ fontSize: '12px', color: 'transparent' }}>Loading more...</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// Inline spinner for loading more
function InlineSpinner({ size = 16 }: { size?: number }) {
  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        style={{ animation: 'spin 0.8s linear infinite' }}
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke="currentColor"
          strokeWidth="2"
          strokeOpacity="0.25"
        />
        <path
          d="M14 8a6 6 0 00-6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </>
  );
}

// ============================================
// Loading Skeleton Components (Linear-style)
// ============================================

function SkeletonPulse({ style }: { style?: React.CSSProperties }) {
  return (
    <>
      <style>
        {`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}
      </style>
      <div
        style={{
          background: 'linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: '4px',
          ...style,
        }}
      />
    </>
  );
}

function MobileSkeletonRow() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Avatar skeleton */}
      <SkeletonPulse style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }} />

      {/* Content skeleton */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SkeletonPulse style={{ width: '60%', height: '14px' }} />
        <SkeletonPulse style={{ width: '40%', height: '11px' }} />
      </div>

      {/* Right side skeleton */}
      <SkeletonPulse style={{ width: '50px', height: '11px' }} />
    </div>
  );
}

// Skeleton row that matches actual table column structure (no layout shift)
function SkeletonTableRow({
  showCheckbox,
  showTypeColumn,
  showPhoneColumn,
  showMembersColumn,
  showAiColumns = false,
}: {
  showCheckbox: boolean;
  showTypeColumn: boolean;
  showPhoneColumn: boolean;
  showMembersColumn: boolean;
  showAiColumns?: boolean;
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Checkbox column - conditional */}
      {showCheckbox && (
        <td style={{ ...tdStyle, width: '40px', paddingLeft: '12px' }}>
          <SkeletonPulse style={{ width: '16px', height: '16px', borderRadius: '3px' }} />
        </td>
      )}

      {/* Name column */}
      <td style={{ ...tdStyle, paddingLeft: showCheckbox ? '16px' : '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SkeletonPulse style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} />
          <SkeletonPulse style={{ width: '120px', height: '14px' }} />
        </div>
      </td>

      {/* Type column - hide when AI columns shown */}
      {showTypeColumn && !showAiColumns && (
        <td style={tdStyle}>
          <SkeletonPulse style={{ width: '50px', height: '20px', borderRadius: '4px' }} />
        </td>
      )}

      {/* Username column - hide when AI columns shown */}
      {!showAiColumns && (
        <td style={tdStyle}>
          <SkeletonPulse style={{ width: '80px', height: '14px' }} />
        </td>
      )}

      {/* Phone column - conditional */}
      {showPhoneColumn && (
        <td style={tdStyle}>
          <SkeletonPulse style={{ width: '90px', height: '14px' }} />
        </td>
      )}

      {/* Members column - conditional */}
      {showMembersColumn && (
        <td style={tdStyle}>
          <SkeletonPulse style={{ width: '40px', height: '14px' }} />
        </td>
      )}

      {/* Tags column - always visible */}
      <td style={tdStyle}>
        <SkeletonPulse style={{ width: '70px', height: '20px', borderRadius: '4px' }} />
      </td>

      {/* AI Action column */}
      {showAiColumns && (
        <td style={{ ...tdStyle, width: '110px' }}>
          <SkeletonPulse style={{ width: '80px', height: '16px' }} />
        </td>
      )}

      {/* AI Summary column - wider */}
      {showAiColumns && (
        <td style={{ ...tdStyle, width: '320px' }}>
          <SkeletonPulse style={{ width: '240px', height: '14px' }} />
        </td>
      )}

      {/* Last Active column */}
      <td style={tdStyle}>
        <SkeletonPulse style={{ width: '55px', height: '14px' }} />
      </td>

      {/* Chevron column */}
      <td style={{ ...tdStyle, width: '36px' }}></td>
    </tr>
  );
}

// Mobile loading state only (desktop uses SkeletonTableRow directly in table)
function MobileLoadingState() {
  return (
    <div>
      <style>
        {`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}
      </style>
      {[...Array(6)].map((_, i) => (
        <MobileSkeletonRow key={i} />
      ))}
    </div>
  );
}

// ============================================
// Mobile Contact Card (for mobile view)
// ============================================

interface MobileContactCardProps {
  contact: Contact;
  onClick: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
}

function MobileContactCard({ contact, onClick, isSelected, onToggleSelect }: MobileContactCardProps) {
  const [imageError, setImageError] = useState(false);

  const isGroup = contact.type === 'group' || contact.type === 'supergroup';
  const isChannel = contact.type === 'channel';
  const isPerson = contact.type === 'private';
  const hasAvatar = contact.avatarUrl && !imageError;
  const avatarColorScheme = getAvatarColor(contact.id);

  const typeLabel = isChannel ? 'Channel' : isGroup ? 'Group' : 'Person';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: isSelected ? 'var(--accent-subtle)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          padding: 0,
          background: isSelected ? 'var(--accent-primary)' : 'transparent',
          border: isSelected ? 'none' : '1px solid var(--border-default)',
          borderRadius: '4px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {isSelected && <CheckIcon size={12} color="white" />}
      </button>

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {hasAvatar ? (
          <img
            src={contact.avatarUrl!.startsWith('/media/')
              ? `/api${contact.avatarUrl}`
              : contact.avatarUrl!}
            alt={contact.name}
            onError={() => setImageError(true)}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: avatarColorScheme.bg,
            color: avatarColorScheme.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '14px',
          }}>
            {isGroup ? (
              <GroupIcon style={{ width: '18px', height: '18px' }} />
            ) : isChannel ? (
              <ChannelIcon style={{ width: '18px', height: '18px' }} />
            ) : (
              contact.initials
            )}
          </div>
        )}
        {/* Online indicator */}
        {isPerson && contact.isOnline && (
          <div style={{
            position: 'absolute',
            bottom: '0',
            right: '0',
            width: '12px',
            height: '12px',
            background: 'var(--success)',
            border: '2px solid var(--bg-primary)',
            borderRadius: '50%',
          }} />
        )}
      </div>

      {/* Contact Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {contact.name}
          </span>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-quaternary)',
            padding: '2px 6px',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            flexShrink: 0,
          }}>
            {typeLabel}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Username or phone */}
          {contact.username ? (
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              @{contact.username}
            </span>
          ) : contact.phone ? (
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {contact.phone}
            </span>
          ) : null}

          {/* Messages count */}
          <span style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>
            {contact.totalMessages} msgs
          </span>
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
            {contact.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: 500,
                  color: tag.color || 'var(--text-tertiary)',
                  background: tag.color ? `${tag.color}15` : 'var(--bg-tertiary)',
                  borderRadius: '4px',
                }}
              >
                <span style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: tag.color || 'var(--text-quaternary)',
                }} />
                {tag.name}
              </span>
            ))}
            {contact.tags.length > 3 && (
              <span style={{ fontSize: '10px', color: 'var(--text-quaternary)' }}>
                +{contact.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right side - last active time + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{
          fontSize: '11px',
          color: isPerson && contact.isOnline ? '#22C55E' : 'var(--text-quaternary)',
          fontWeight: isPerson && contact.isOnline ? 500 : 400,
        }}>
          {isPerson && contact.isOnline ? 'Online' : formatRelativeTime(contact.lastInteraction)}
        </span>
        <ChevronRightIcon style={{ width: '16px', height: '16px', color: 'var(--text-quaternary)' }} />
      </div>
    </div>
  );
}

// ============================================
// Table Row (for desktop view)
// ============================================

interface ContactRowProps {
  contact: Contact;
  onClick: () => void;
  typeFilter: 'all' | 'people' | 'groups' | 'channels';
  showPhoneColumn: boolean;
  showMembersColumn: boolean;
  showAiColumns: boolean;
  availableTags: Tag[];
  onTagsChange?: (contactId: string, tags: { id: string; name: string; color: string | null }[]) => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  showCheckbox: boolean;
  isPartnerView?: boolean; // True when viewing Partner tab - shows Status column instead of Action
}

function ContactRow({ contact, onClick, typeFilter, showPhoneColumn, showMembersColumn, showAiColumns, availableTags, onTagsChange, isSelected, onToggleSelect, showCheckbox, isPartnerView = false }: ContactRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagColor, setNewTagColor] = useState('#E17076');
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const tagSearchInputRef = useRef<HTMLInputElement>(null);

  // Close tag dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setIsTagDropdownOpen(false);
        setTagSearchQuery('');
        setIsCreatingTag(false);
      }
    };
    if (isTagDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when dropdown opens
      setTimeout(() => tagSearchInputRef.current?.focus(), 10);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isTagDropdownOpen]);

  const handleTagToggle = (tag: Tag, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onTagsChange) return;

    const currentTags = contact.tags || [];
    const hasTag = currentTags.some(t => t.id === tag.id);

    if (hasTag) {
      onTagsChange(contact.id, currentTags.filter(t => t.id !== tag.id));
    } else {
      onTagsChange(contact.id, [...currentTags, { id: tag.id, name: tag.name, color: tag.color }]);
    }
  };

  // Filter tags by search query
  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return availableTags;
    const query = tagSearchQuery.toLowerCase();
    return availableTags.filter(tag => tag.name.toLowerCase().includes(query));
  }, [availableTags, tagSearchQuery]);

  // Create a new tag
  const handleCreateTag = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tagSearchQuery.trim() || !onTagsChange) return;

    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tagSearchQuery.trim(), color: newTagColor }),
      });
      const data = await response.json();
      if (data.success && data.data) {
        const newTag = data.data;
        // Add to contact
        const currentTags = contact.tags || [];
        onTagsChange(contact.id, [...currentTags, { id: newTag.id, name: newTag.name, color: newTag.color }]);
        setTagSearchQuery('');
        setIsCreatingTag(false);
        setIsTagDropdownOpen(false);
      }
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  // Tag colors for create form
  const TAG_COLORS = ['#E17076', '#FAA774', '#A695E7', '#7BC862', '#6EC9CB', '#65AADD', '#EE7AAE', '#F59E0B'];

  const isGroup = contact.type === 'group' || contact.type === 'supergroup';
  const isChannel = contact.type === 'channel';
  const isPerson = contact.type === 'private';
  const hasAvatar = contact.avatarUrl && !imageError;
  const avatarColorScheme = getAvatarColor(contact.id);

  const typeLabel = isChannel ? 'Channel' : isGroup ? 'Group' : 'Person';

  // Fix online status: if online, don't show relative time - show "Online"
  // If not online, show the relative time from lastInteraction
  const getStatusDisplay = () => {
    if (isPerson && contact.isOnline) {
      return 'Online';
    }
    return formatRelativeTime(contact.lastInteraction);
  };

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        cursor: 'pointer',
        background: isSelected ? 'var(--accent-subtle)' : isHovered ? 'var(--bg-hover)' : 'transparent',
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background 100ms ease',
      }}
    >
      {/* Checkbox - only show when no filters active */}
      {showCheckbox && (
        <td style={{ ...tdStyle, width: '40px', paddingLeft: '12px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
              height: '16px',
              padding: 0,
              background: isSelected ? 'var(--accent-primary)' : 'transparent',
              border: isSelected ? 'none' : '1px solid var(--border-default)',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            {isSelected && <CheckIcon size={10} color="white" />}
          </button>
        </td>
      )}

      {/* Name */}
      <td style={{ ...tdStyle, paddingLeft: showCheckbox ? '16px' : '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {hasAvatar ? (
              <img
                src={contact.avatarUrl!.startsWith('/media/')
                  ? `/api${contact.avatarUrl}`
                  : contact.avatarUrl!}
                alt={contact.name}
                onError={() => setImageError(true)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: avatarColorScheme.bg,
                color: avatarColorScheme.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '11px',
              }}>
                {isGroup ? (
                  <GroupIcon style={{ width: '14px', height: '14px' }} />
                ) : isChannel ? (
                  <ChannelIcon style={{ width: '14px', height: '14px' }} />
                ) : (
                  contact.initials
                )}
              </div>
            )}
            {/* Online indicator - only show if actually online */}
            {isPerson && contact.isOnline && (
              <div style={{
                position: 'absolute',
                bottom: '0',
                right: '0',
                width: '8px',
                height: '8px',
                background: 'var(--success)',
                border: '2px solid var(--bg-primary)',
                borderRadius: '50%',
              }} />
            )}
          </div>

          {/* Name only - tags moved to separate column */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.01em',
            }}>
              {contact.name}
            </div>
          </div>
        </div>
      </td>

      {/* Type - show for Partner view (has mix of private/group) OR when no AI columns */}
      {((typeFilter === 'all' && !showAiColumns) || (showAiColumns && isPartnerView)) && (
        <td style={tdStyle}>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            padding: '2px 6px',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
          }}>
            {typeLabel}
          </span>
        </td>
      )}

      {/* Username - hide when AI columns are shown (groups don't have usernames) */}
      {!showAiColumns && (
        <td style={tdStyle}>
          {contact.username ? (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              @{contact.username}
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>—</span>
          )}
        </td>
      )}

      {/* Phone - only for People */}
      {showPhoneColumn && (
        <td style={tdStyle}>
          {contact.phone ? (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {contact.phone}
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>—</span>
          )}
        </td>
      )}

      {/* Members - only for Groups/Channels */}
      {showMembersColumn && (
        <td style={tdStyle}>
          {(isGroup || isChannel) && contact.memberCount ? (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {contact.memberCount.toLocaleString()}
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>—</span>
          )}
        </td>
      )}

      {/* Tags column - always visible */}
      <td style={tdStyle}>
        {showAiColumns ? (
          /* AI view: Simple read-only tag display */
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {contact.tags && contact.tags.length > 0 ? (
              <>
                {contact.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: tag.color || 'var(--text-tertiary)',
                      background: tag.color ? `${tag.color}15` : 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: tag.color || 'var(--text-quaternary)',
                      flexShrink: 0,
                    }} />
                    {tag.name}
                  </span>
                ))}
                {contact.tags.length > 2 && (
                  <span style={{
                    fontSize: '11px',
                    color: 'var(--text-quaternary)',
                    padding: '2px 4px',
                  }}>
                    +{contact.tags.length - 2}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>—</span>
            )}
          </div>
        ) : (
          /* Normal view: Tags with inline assignment */
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {contact.tags && contact.tags.length > 0 ? (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', flex: 1 }}>
              {contact.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: tag.color || 'var(--text-tertiary)',
                    background: tag.color ? `${tag.color}15` : 'var(--bg-tertiary)',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: tag.color || 'var(--text-quaternary)',
                    flexShrink: 0,
                  }} />
                  {tag.name}
                </span>
              ))}
              {contact.tags.length > 2 && (
                <span style={{
                  fontSize: '11px',
                  color: 'var(--text-quaternary)',
                  padding: '2px 4px',
                }}>
                  +{contact.tags.length - 2}
                </span>
              )}
            </div>
          ) : null}

          {/* Inline tag add button */}
          {onTagsChange && availableTags.length > 0 && (
            <div ref={tagDropdownRef} style={{ position: 'relative' }}>
              <Tooltip content="Add tag" position="top" disabled={isTagDropdownOpen}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTagDropdownOpen(!isTagDropdownOpen);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  padding: 0,
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: 'var(--text-quaternary)',
                  opacity: isHovered || isTagDropdownOpen ? 1 : 0,
                  transition: 'opacity 150ms ease, border-color 150ms ease, color 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  e.currentTarget.style.color = 'var(--text-quaternary)';
                }}
              >
                <PlusIcon size={12} />
              </button>
              </Tooltip>

              {isTagDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    width: '220px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    zIndex: 100,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isCreatingTag ? (
                    <>
                      {/* Search Input - Linear style */}
                      <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <input
                          ref={tagSearchInputRef}
                          type="text"
                          placeholder="Search or create label..."
                          value={tagSearchQuery}
                          onChange={(e) => setTagSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Escape') {
                              setIsTagDropdownOpen(false);
                              setTagSearchQuery('');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '4px',
                            outline: 'none',
                          }}
                        />
                      </div>

                      {/* Tag list with checkboxes */}
                      <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '4px' }}>
                        {filteredTags.length === 0 && !tagSearchQuery.trim() ? (
                          <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            No labels available
                          </div>
                        ) : filteredTags.length === 0 && tagSearchQuery.trim() ? (
                          <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            No labels found
                          </div>
                        ) : (
                          filteredTags.map((tag) => {
                            const isSelected = contact.tags?.some((t) => t.id === tag.id);
                            return (
                              <button
                                key={tag.id}
                                onClick={(e) => handleTagToggle(tag, e)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  width: '100%',
                                  padding: '6px 8px',
                                  fontSize: '12px',
                                  color: 'var(--text-primary)',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <span
                                  style={{
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '3px',
                                    border: isSelected ? 'none' : '1px solid var(--border-default)',
                                    background: isSelected ? 'var(--accent-primary)' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  {isSelected && <CheckIcon size={10} color="white" />}
                                </span>
                                <span
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: tag.color || 'var(--text-quaternary)',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {tag.name}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* Create new label option */}
                      <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '4px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsCreatingTag(true);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '6px 8px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'var(--accent-primary)',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <PlusIcon size={12} />
                          Create new label
                        </button>
                      </div>

                      {/* Keyboard hints - Linear style */}
                      <div style={{
                        padding: '6px 8px',
                        borderTop: '1px solid var(--border-subtle)',
                        background: 'var(--bg-secondary)',
                        borderRadius: '0 0 8px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-quaternary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <kbd style={{ padding: '1px 4px', background: 'var(--bg-tertiary)', borderRadius: '3px', fontSize: '9px' }}>↵</kbd>
                          select
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-quaternary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <kbd style={{ padding: '1px 4px', background: 'var(--bg-tertiary)', borderRadius: '3px', fontSize: '9px' }}>esc</kbd>
                          close
                        </span>
                      </div>
                    </>
                  ) : (
                    /* Create new tag form */
                    <div style={{ padding: '12px' }}>
                      <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Create Label
                      </div>
                      <input
                        type="text"
                        placeholder="Label name..."
                        value={tagSearchQuery}
                        onChange={(e) => setTagSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') handleCreateTag(e as unknown as React.MouseEvent);
                          if (e.key === 'Escape') {
                            setIsCreatingTag(false);
                            setTagSearchQuery('');
                          }
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '6px',
                          outline: 'none',
                          marginBottom: '10px',
                        }}
                      />
                      {/* Color picker */}
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                        {TAG_COLORS.map(color => (
                          <button
                            key={color}
                            onClick={(e) => { e.stopPropagation(); setNewTagColor(color); }}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              background: color,
                              border: newTagColor === color ? '2px solid var(--text-primary)' : 'none',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsCreatingTag(false);
                            setTagSearchQuery('');
                          }}
                          style={{
                            flex: 1,
                            padding: '8px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-tertiary)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateTag}
                          disabled={!tagSearchQuery.trim()}
                          style={{
                            flex: 1,
                            padding: '8px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'white',
                            background: tagSearchQuery.trim() ? 'var(--accent-primary)' : 'var(--text-quaternary)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: tagSearchQuery.trim() ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

            {/* Show dash only if no tags and no dropdown */}
            {(!contact.tags || contact.tags.length === 0) && (!onTagsChange || availableTags.length === 0) && (
              <span style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>—</span>
            )}
          </div>
        )}
      </td>

      {/* AI Action - Linear design system urgency badge */}
      {showAiColumns && (
        <td style={{ ...tdStyle, width: '110px' }}>
          {(() => {
            // Smart urgency calculation - uses AI data when available, falls back to lastInteraction
            const daysInactive = getEffectiveDaysInactive({
              aiStatusReason: contact.aiStatusReason,
              lastInteraction: contact.lastInteraction,
              aiStatus: contact.aiStatus,
            });

            // Use AI's actual recommendations when available
            const urgencyLevel = getUrgencyLevelFromAI(contact.aiUrgencyLevel, contact.aiAction, contact.aiStatus, daysInactive);
            const urgencyColor = getUrgencyColor(contact.aiStatus, daysInactive);
            const urgencyBg = getUrgencyBgColor(contact.aiStatus, daysInactive);
            const statusLabel = getStatusLabel(contact.aiStatus);
            // CRITICAL FIX: Use AI's actual action recommendation instead of hardcoded logic
            const actionLabel = getActionLabelFromAI(contact.aiAction, contact.aiStatus, daysInactive);
            const cleanSummary = getCleanSummary(contact.aiStatusReason);


            // Show days badge when inactive 3+ days OR when AI flagged as waiting
            const showDaysBadge = daysInactive >= 3 ||
              (contact.aiStatus === 'needs_owner') ||
              (contact.aiStatus === 'at_risk' && daysInactive > 0);

            if (contact.aiAnalyzing) {
              // Analyzing state - skeleton that matches badge shape
              return (
                <div
                  className="ai-shimmer"
                  style={{
                    width: '80px',
                    height: '24px',
                    borderRadius: '6px',
                    background: 'linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)',
                    backgroundSize: '200% 100%',
                  }}
                />
              );
            }

            if (!contact.aiStatus) {
              // No AI status - show neutral state
              return (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'rgba(107, 114, 128, 0.08)',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#6B7280',
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#6B7280',
                    flexShrink: 0,
                  }} />
                  Review
                </span>
              );
            }

            // Build tooltip content - Different for Partner vs Customer/Groups
            const hasSuggestedAction = contact.aiSuggestedAction;
            const hasContent = hasSuggestedAction || cleanSummary;

            // Show "Analyzed as: X" when conversation has multiple tags (transparency)
            const hasMultipleTags = contact.tags.length > 1;
            const analyzedAsInfo = hasMultipleTags && contact.aiAnalyzedTagName ? (
              <div style={{
                fontSize: '10px',
                color: 'var(--text-quaternary)',
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px solid var(--border-subtle)',
              }}>
                Analyzed as: <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{contact.aiAnalyzedTagName}</span>
              </div>
            ) : null;

            // PARTNER VIEW: Show Status in badge, Action only in tooltip (concise)
            // CUSTOMER/GROUPS VIEW: Show Action in badge, Summary in tooltip (original behavior)
            const tooltipContent = isPartnerView ? (
              // Partner tooltip - shows Next Step only (concise, no "why")
              <div style={{ maxWidth: '260px' }}>
                {hasSuggestedAction ? (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#3B82F6', marginBottom: '2px', textTransform: 'uppercase' }}>
                      Next Step
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                      {contact.aiSuggestedAction}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>No suggested action yet</div>
                )}
                {analyzedAsInfo}
              </div>
            ) : (
              // Customer/Groups tooltip - shows Next Action
              <div style={{ maxWidth: '280px' }}>
                {/* Next Action */}
                {contact.aiSuggestedAction ? (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#3B82F6', marginBottom: '2px', textTransform: 'uppercase' }}>
                      Next Action
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      lineHeight: 1.4,
                    }}>
                      {contact.aiSuggestedAction}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>
                    No suggested action yet
                  </div>
                )}
                {analyzedAsInfo}
              </div>
            );

            // PARTNER VIEW: Show status label (Nurturing, Active, etc.)
            // CUSTOMER/GROUPS VIEW: Show action label (Escalate, Follow up, etc.) - original behavior
            const displayLabel = isPartnerView ? statusLabel : actionLabel;

            // Render the badge with tooltip
            return (
              <Tooltip content={tooltipContent} position="top" maxWidth={340}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: urgencyBg,
                  cursor: 'help',
                  transition: 'background 150ms ease',
                  position: 'relative',
                }}>
                  {/* Status dot */}
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: urgencyColor,
                    flexShrink: 0,
                    boxShadow: urgencyLevel === 'critical' || urgencyLevel === 'high'
                      ? `0 0 6px ${urgencyColor}40`
                      : 'none',
                  }} />

                  {/* Label - Status for Partners, Action for Customers/Groups */}
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: urgencyColor,
                    whiteSpace: 'nowrap',
                  }}>
                    {displayLabel}
                  </span>

                  {/* Days badge - visible indicator of urgency (for Customer/Groups only) */}
                  {!isPartnerView && showDaysBadge && daysInactive > 0 && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: urgencyLevel === 'critical' || urgencyLevel === 'high' ? '#fff' : urgencyColor,
                      background: urgencyLevel === 'critical' || urgencyLevel === 'high'
                        ? urgencyColor
                        : `${urgencyColor}18`,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      marginLeft: '1px',
                    }}>
                      {daysInactive}d
                    </span>
                  )}
                </span>
              </Tooltip>
            );
          })()}
        </td>
      )}

      {/* AI Summary - wider for readability */}
      {showAiColumns && (
        <td style={{ ...tdStyle, width: '320px' }}>
          {contact.aiAnalyzing ? (
            // Analyzing state - show shimmer placeholder
            <div className="ai-shimmer" style={{
              height: '32px',
              borderRadius: '4px',
              background: 'linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)',
              backgroundSize: '200% 100%',
            }} />
          ) : contact.aiSummary ? (
            // Done - show summary
            <span style={{
              fontSize: '12px',
              color: 'var(--text-primary)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: '1.4',
            }}>
              {contact.aiSummary}
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>—</span>
          )}
        </td>
      )}

      {/* Last Active - shows "Online" if online, otherwise relative time */}
      <td style={tdStyle}>
        <span style={{
          fontSize: '12px',
          color: isPerson && contact.isOnline ? '#22C55E' : 'var(--text-tertiary)',
          fontWeight: isPerson && contact.isOnline ? 500 : 400,
        }}>
          {getStatusDisplay()}
        </span>
      </td>

      {/* Chevron */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <ChevronRightIcon style={{ width: '14px', height: '14px', color: 'var(--text-quaternary)' }} />
      </td>
    </tr>
  );
}

// ============================================
// Styles
// ============================================

// Linear-style consistent spacing
const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text-tertiary)',
  textAlign: 'left',
};

const thButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
};

// ============================================
// Icons
// ============================================

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

function ChannelIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" />
      <path d="M8 10V2" />
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function SparkleIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path
        d="M8 1.5l1.286 3.214L12.5 6l-3.214 1.286L8 10.5 6.714 7.286 3.5 6l3.214-1.286L8 1.5z"
        fill="currentColor"
      />
      <path
        d="M12 10l.643 1.607L14.25 12.25l-1.607.643L12 14.5l-.643-1.607L9.75 12.25l1.607-.643L12 10z"
        fill="currentColor"
        opacity="0.6"
      />
      <path
        d="M4 10l.429 1.071L5.5 11.5l-1.071.429L4 13l-.429-1.071L2.5 11.5l1.071-.429L4 10z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}

function ChevronRightIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronDownIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 5 6 8 9 5" />
    </svg>
  );
}

function TagIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 9.05V2.5a1 1 0 011-1h6.55a1 1 0 01.7.29l5.04 5.04a1 1 0 010 1.42L9.25 13.8a1 1 0 01-1.42 0L2.79 8.76a1 1 0 01-.29-.71z" />
      <circle cx="5" cy="5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4v4l2.5 1.5" />
    </svg>
  );
}

function MinusIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h6" />
    </svg>
  );
}

function CheckIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2 6 5 9 10 3" />
    </svg>
  );
}

function CloseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M9 3L3 9M3 3l6 6" />
    </svg>
  );
}

function PlusIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}
