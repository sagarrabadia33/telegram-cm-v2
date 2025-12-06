'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { SearchIcon } from './Icons';
import Tooltip from './Tooltip';
import SmartFilterSection from './SmartFilterSection';

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
}

// All available tags for filtering
export interface Tag {
  id: string;
  name: string;
  color: string | null;
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

type LastActiveFilter = typeof LAST_ACTIVE_FILTERS[number]['key'];

type SortKey = 'name' | 'type' | 'totalMessages' | 'lastInteraction' | 'memberCount' | 'phone';
type SortDirection = 'asc' | 'desc';

interface ContactsTableProps {
  contacts: Contact[];
  onSelect: (contact: Contact) => void;
  typeFilter: 'all' | 'people' | 'groups' | 'channels';
  onTypeFilterChange: (filter: 'all' | 'people' | 'groups' | 'channels') => void;
  counts: { all: number; people: number; groups: number; channels: number };
  onExportCsv?: () => void;
  allTags?: Tag[];
  onTagsChange?: (contactId: string, tags: { id: string; name: string; color: string | null }[]) => void;
  onBulkTagsChange?: (contactIds: string[], tags: { id: string; name: string; color: string | null }[]) => void;
  isLoading?: boolean;
}

export default function ContactsTable({
  contacts,
  onSelect,
  typeFilter,
  onTypeFilterChange,
  counts,
  onExportCsv,
  allTags = [],
  onTagsChange,
  onBulkTagsChange,
  isLoading = false,
}: ContactsTableProps) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastInteraction');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [lastActiveFilter, setLastActiveFilter] = useState<LastActiveFilter>('all');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isLastActiveDropdownOpen, setIsLastActiveDropdownOpen] = useState(false);

  // Smart filter state
  const [isSmartFilterExpanded, setIsSmartFilterExpanded] = useState(false);
  const [smartFilteredIds, setSmartFilteredIds] = useState<string[] | null>(null);
  const [smartFilterDescription, setSmartFilterDescription] = useState<string | null>(null);
  const [filterClearSignal, setFilterClearSignal] = useState(0); // Signal to clear SmartFilterSection state

  // Multi-select state
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isBulkTagDropdownOpen, setIsBulkTagDropdownOpen] = useState(false);
  const [bulkTagSearchQuery, setBulkTagSearchQuery] = useState('');
  const [isCreatingBulkTag, setIsCreatingBulkTag] = useState(false);
  const [newBulkTagName, setNewBulkTagName] = useState('');
  const bulkTagDropdownRef = useRef<HTMLDivElement>(null);
  const bulkTagSearchInputRef = useRef<HTMLInputElement>(null);
  const newBulkTagInputRef = useRef<HTMLInputElement>(null);

  // Smart filter bulk tag state
  const [isSmartFilterTagDropdownOpen, setIsSmartFilterTagDropdownOpen] = useState(false);
  const [isApplyingBulkTag, setIsApplyingBulkTag] = useState(false);
  const [smartFilterTagSearchQuery, setSmartFilterTagSearchQuery] = useState('');
  const [isCreatingSmartFilterTag, setIsCreatingSmartFilterTag] = useState(false);
  const [newSmartFilterTagName, setNewSmartFilterTagName] = useState('');
  const smartFilterTagDropdownRef = useRef<HTMLDivElement>(null);
  const smartFilterTagSearchInputRef = useRef<HTMLInputElement>(null);
  const newSmartFilterTagInputRef = useRef<HTMLInputElement>(null);

  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const lastActiveDropdownRef = useRef<HTMLDivElement>(null);

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
      if (smartFilterTagDropdownRef.current && !smartFilterTagDropdownRef.current.contains(e.target as Node)) {
        setIsSmartFilterTagDropdownOpen(false);
        setSmartFilterTagSearchQuery('');
        setIsCreatingSmartFilterTag(false);
        setNewSmartFilterTagName('');
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

  // Focus smart filter tag search when dropdown opens
  useEffect(() => {
    if (isSmartFilterTagDropdownOpen) {
      setTimeout(() => smartFilterTagSearchInputRef.current?.focus(), 10);
    }
  }, [isSmartFilterTagDropdownOpen]);

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

  // Filter by tags
  const tagFiltered = useMemo(() => {
    if (selectedTagIds.length === 0) return searchFiltered;
    return searchFiltered.filter(c =>
      c.tags?.some(t => selectedTagIds.includes(t.id))
    );
  }, [searchFiltered, selectedTagIds]);

  // Filter by last active
  const lastActiveFiltered = useMemo(() => {
    if (lastActiveFilter === 'all') return tagFiltered;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsStart = new Date(todayStart.getTime() - 90 * 24 * 60 * 60 * 1000);

    return tagFiltered.filter(c => {
      const lastActive = new Date(c.lastInteraction);
      switch (lastActiveFilter) {
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
  }, [tagFiltered, lastActiveFilter]);

  // Apply smart filter (replaces tag and lastActive filters when active)
  const smartFiltered = useMemo(() => {
    if (smartFilteredIds === null) return lastActiveFiltered;
    // When smart filter is active, filter by the IDs but start from searchFiltered
    // (ignoring tag and lastActive filters per the design spec)
    return searchFiltered.filter(c => smartFilteredIds.includes(c.id));
  }, [searchFiltered, lastActiveFiltered, smartFilteredIds]);

  // Sort contacts
  const sorted = useMemo(() => {
    return [...smartFiltered].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'totalMessages':
          comparison = a.totalMessages - b.totalMessages;
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
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [smartFiltered, sortKey, sortDirection]);

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

  // Smart filter handler
  const handleSmartFilterChange = (filteredIds: string[] | null, description?: string) => {
    setSmartFilteredIds(filteredIds);
    setSmartFilterDescription(description || null);
    // Clear other filters when smart filter is applied
    if (filteredIds !== null) {
      setSelectedTagIds([]);
      setLastActiveFilter('all');
    }
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

  // Smart filter bulk tag handler
  const handleSmartFilterBulkTag = async (tagId: string) => {
    if (!smartFilteredIds || smartFilteredIds.length === 0) return;

    setIsApplyingBulkTag(true);
    try {
      const response = await fetch('/api/contacts/bulk-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationIds: smartFilteredIds,
          tagId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to apply tag');
      }

      const result = await response.json();
      console.log('Bulk tag result:', result);

      // Update the local state for contacts that were tagged
      if (onBulkTagsChange) {
        const tag = availableTags.find(t => t.id === tagId);
        if (tag) {
          // Get contacts that don't already have this tag
          const contactsToUpdate = sorted
            .filter(c => smartFilteredIds.includes(c.id))
            .filter(c => !c.tags?.some(t => t.id === tagId))
            .map(c => c.id);

          if (contactsToUpdate.length > 0) {
            // For each contact, add the new tag to their existing tags
            contactsToUpdate.forEach(contactId => {
              const contact = sorted.find(c => c.id === contactId);
              if (contact && onTagsChange) {
                const newTags = [...(contact.tags || []), { id: tag.id, name: tag.name, color: tag.color }];
                onTagsChange(contactId, newTags);
              }
            });
          }
        }
      }

      setIsSmartFilterTagDropdownOpen(false);
    } catch (error) {
      console.error('Error applying bulk tag:', error);
    } finally {
      setIsApplyingBulkTag(false);
    }
    setIsBulkTagDropdownOpen(false);
    setBulkTagSearchQuery('');
  };

  // Filter tags for bulk dropdown
  const filteredBulkTags = useMemo(() => {
    if (!bulkTagSearchQuery.trim()) return availableTags;
    const query = bulkTagSearchQuery.toLowerCase();
    return availableTags.filter(tag => tag.name.toLowerCase().includes(query));
  }, [availableTags, bulkTagSearchQuery]);

  // Filter tags for smart filter bulk dropdown
  const filteredSmartFilterTags = useMemo(() => {
    if (!smartFilterTagSearchQuery.trim()) return availableTags;
    const query = smartFilterTagSearchQuery.toLowerCase();
    return availableTags.filter(tag => tag.name.toLowerCase().includes(query));
  }, [availableTags, smartFilterTagSearchQuery]);

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

  // Create a new tag and assign to all smart-filtered contacts
  const createSmartFilterTag = async (tagName: string) => {
    if (!tagName.trim() || !smartFilteredIds || smartFilteredIds.length === 0) return;

    setIsApplyingBulkTag(true);
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

      // Apply tag to all smart-filtered contacts via API
      const bulkResponse = await fetch('/api/contacts/bulk-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: smartFilteredIds,
          tagId: newTag.id,
          action: 'add',
        }),
      });

      if (bulkResponse.ok) {
        // Update local state for visible contacts
        const sorted = contacts;
        const contactsToUpdate = smartFilteredIds!.filter(id => sorted.some(c => c.id === id));

        if (contactsToUpdate.length > 0) {
          contactsToUpdate.forEach(contactId => {
            const contact = sorted.find(c => c.id === contactId);
            if (contact && onTagsChange) {
              const newTags = [...(contact.tags || []), { id: newTag.id, name: newTag.name, color: newTag.color }];
              onTagsChange(contactId, newTags);
            }
          });
        }
      }

      // Reset state
      setNewSmartFilterTagName('');
      setIsCreatingSmartFilterTag(false);
      setSmartFilterTagSearchQuery('');
      setIsSmartFilterTagDropdownOpen(false);
    } catch (error) {
      console.error('Failed to create smart filter tag:', error);
    } finally {
      setIsApplyingBulkTag(false);
    }
  };

  const filterTabs = [
    { key: 'all' as const, label: 'All', count: counts.all },
    { key: 'people' as const, label: 'People', count: counts.people },
    { key: 'groups' as const, label: 'Groups', count: counts.groups },
    { key: 'channels' as const, label: 'Channels', count: counts.channels },
  ];

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

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: isMobile ? '12px' : '16px',
      }}>
        {/* Left: Title + Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <h1 style={{
            fontSize: isMobile ? '16px' : '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            Contacts
          </h1>

          {/* Type Filters - Linear-style segmented control */}
          <div style={{
            display: 'flex',
            gap: '1px',
            padding: '2px',
            background: 'var(--bg-tertiary)',
            borderRadius: '6px',
          }}>
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTypeFilterChange(tab.key)}
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: typeFilter === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  background: typeFilter === tab.key ? 'var(--bg-primary)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  boxShadow: typeFilter === tab.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {tab.label}
                <span style={{
                  marginLeft: '4px',
                  color: 'var(--text-quaternary)',
                  fontSize: '11px',
                }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Tag Filter Dropdown - Hidden on mobile and when smart filter is active */}
          {!isMobile && !smartFilterDescription && <div ref={tagDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setIsTagDropdownOpen(!isTagDropdownOpen);
                setIsLastActiveDropdownOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 500,
                color: selectedTagIds.length > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                background: selectedTagIds.length > 0 ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                border: `1px solid ${selectedTagIds.length > 0 ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              <TagIcon size={12} />
              {selectedTagIds.length > 0 ? `${selectedTagIds.length} tag${selectedTagIds.length > 1 ? 's' : ''}` : 'Tags'}
              <ChevronDownIcon size={10} />
            </button>

            {isTagDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                minWidth: '200px',
                maxHeight: '300px',
                overflowY: 'auto',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 100,
              }}>
                {/* Header */}
                <div style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Filter by tag
                  </span>
                  {selectedTagIds.length > 0 && (
                    <button
                      onClick={clearTagFilters}
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {/* Tag list */}
                <div style={{ padding: '4px' }}>
                  {availableTags.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                      No tags found
                    </div>
                  ) : (
                    availableTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => toggleTagFilter(tag.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '8px',
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          background: selectedTagIds.includes(tag.id) ? 'var(--bg-tertiary)' : 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '3px',
                          border: selectedTagIds.includes(tag.id) ? 'none' : '1px solid var(--border-default)',
                          background: selectedTagIds.includes(tag.id) ? 'var(--accent-primary)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {selectedTagIds.includes(tag.id) && (
                            <CheckIcon size={10} color="white" />
                          )}
                        </span>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: tag.color || 'var(--text-quaternary)',
                        }} />
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>}

          {/* Last Active Filter Dropdown - Hidden on mobile and when smart filter is active */}
          {!isMobile && !smartFilterDescription && <div ref={lastActiveDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setIsLastActiveDropdownOpen(!isLastActiveDropdownOpen);
                setIsTagDropdownOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 500,
                color: lastActiveFilter !== 'all' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                background: lastActiveFilter !== 'all' ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                border: `1px solid ${lastActiveFilter !== 'all' ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              <ClockIcon size={12} />
              {LAST_ACTIVE_FILTERS.find(f => f.key === lastActiveFilter)?.label || 'Last active'}
              <ChevronDownIcon size={10} />
            </button>

            {isLastActiveDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                minWidth: '160px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 100,
                padding: '4px',
              }}>
                {LAST_ACTIVE_FILTERS.map(filter => (
                  <button
                    key={filter.key}
                    onClick={() => {
                      setLastActiveFilter(filter.key);
                      setIsLastActiveDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: '13px',
                      color: lastActiveFilter === filter.key ? 'var(--accent-primary)' : 'var(--text-primary)',
                      background: lastActiveFilter === filter.key ? 'var(--bg-tertiary)' : 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {lastActiveFilter === filter.key && <CheckIcon size={12} color="var(--accent-primary)" />}
                    <span style={{ marginLeft: lastActiveFilter === filter.key ? 0 : '20px' }}>
                      {filter.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>}
        </div>

        {/* Right: Smart Filter + Search + Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: isMobile ? 1 : 'none' }}>
          {/* Smart Filter Toggle (collapsed state) */}
          {!isSmartFilterExpanded && !isMobile && (
            <SmartFilterSection
              contacts={contacts}
              onFilterChange={handleSmartFilterChange}
              availableTags={availableTags}
              isExpanded={isSmartFilterExpanded}
              onToggleExpand={() => setIsSmartFilterExpanded(true)}
              externalClearSignal={filterClearSignal}
            />
          )}
          {/* Search */}
          <div className="relative" style={{ flex: isMobile ? 1 : 'none' }}>
            <SearchIcon
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: '10px', color: 'var(--text-quaternary)', width: '14px', height: '14px' }}
            />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: isMobile ? '100%' : '180px',
                height: '30px',
                paddingLeft: '32px',
                paddingRight: '12px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                outline: 'none',
              }}
              className="placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent-primary)]"
            />
          </div>

          {/* Export Button - Hidden on mobile */}
          {!isMobile && onExportCsv && (
            <Tooltip content="Export contacts to CSV" position="bottom">
            <button
              onClick={onExportCsv}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
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
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
              }}
            >
              <DownloadIcon size={13} />
              Export
            </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Smart Filter Section (expanded state) */}
      {isSmartFilterExpanded && (
        <div style={{ padding: isMobile ? '12px 16px' : '0 24px', paddingTop: '12px' }}>
          <SmartFilterSection
            contacts={contacts}
            onFilterChange={handleSmartFilterChange}
            availableTags={availableTags}
            isExpanded={isSmartFilterExpanded}
            onToggleExpand={() => setIsSmartFilterExpanded(false)}
          />
        </div>
      )}

      {/* Smart Filter Active Indicator - Linear-style */}
      {smartFilterDescription && (
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          borderLeft: '3px solid var(--accent-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--bg-secondary)',
        }}>
          {/* Dismissible filter badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px 4px 10px',
            background: 'var(--accent-subtle)',
            borderRadius: '6px',
            border: '1px solid var(--accent-muted, rgba(99, 102, 241, 0.2))',
          }}>
            <SparkleIcon size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--accent-primary)' }}>
              {smartFilterDescription}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '2px' }}>
              · {sorted.length}
            </span>
            {/* Dismiss × button integrated into badge */}
            <button
              onClick={() => {
                handleSmartFilterChange(null);
                setFilterClearSignal(s => s + 1); // Signal SmartFilterSection to clear its internal state
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                marginLeft: '4px',
                color: 'var(--text-tertiary)',
                background: 'transparent',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                transition: 'all 100ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }}
              title="Clear filter"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          {/* Tag all button with dropdown - pushed to right */}
          <div ref={smartFilterTagDropdownRef} style={{ position: 'relative', marginLeft: 'auto' }}>
            <button
              onClick={() => setIsSmartFilterTagDropdownOpen(!isSmartFilterTagDropdownOpen)}
              disabled={isApplyingBulkTag}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                cursor: isApplyingBulkTag ? 'wait' : 'pointer',
                padding: '5px 10px',
                opacity: isApplyingBulkTag ? 0.6 : 1,
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isApplyingBulkTag) {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }}
            >
              <TagIcon size={12} />
              {isApplyingBulkTag ? 'Tagging...' : 'Tag all'}
              <ChevronDownIcon size={10} />
            </button>

            {/* Tag dropdown - full-featured with search and create */}
            {isSmartFilterTagDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  width: '240px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  zIndex: 1000,
                }}
              >
                {/* Search Input */}
                <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <input
                    ref={smartFilterTagSearchInputRef}
                    type="text"
                    placeholder="Search labels..."
                    value={smartFilterTagSearchQuery}
                    onChange={(e) => setSmartFilterTagSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsSmartFilterTagDropdownOpen(false);
                        setSmartFilterTagSearchQuery('');
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
                  Apply label to {smartFilteredIds?.length || 0} contact{(smartFilteredIds?.length || 0) !== 1 ? 's' : ''}
                </div>

                {/* Tag list */}
                <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
                  {filteredSmartFilterTags.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                      No labels found
                    </div>
                  ) : (
                    filteredSmartFilterTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => handleSmartFilterBulkTag(tag.id)}
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
                      </button>
                    ))
                  )}
                </div>

                {/* Create new label section */}
                {!isCreatingSmartFilterTag ? (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '4px' }}>
                    <button
                      onClick={() => {
                        setIsCreatingSmartFilterTag(true);
                        setTimeout(() => newSmartFilterTagInputRef.current?.focus(), 10);
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
                      ref={newSmartFilterTagInputRef}
                      type="text"
                      placeholder="Label name"
                      value={newSmartFilterTagName}
                      onChange={(e) => setNewSmartFilterTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newSmartFilterTagName.trim()) {
                          createSmartFilterTag(newSmartFilterTagName);
                        } else if (e.key === 'Escape') {
                          setIsCreatingSmartFilterTag(false);
                          setNewSmartFilterTagName('');
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
                          setIsCreatingSmartFilterTag(false);
                          setNewSmartFilterTagName('');
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
                        onClick={() => newSmartFilterTagName.trim() && createSmartFilterTag(newSmartFilterTagName)}
                        disabled={!newSmartFilterTagName.trim()}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 500,
                          color: newSmartFilterTagName.trim() ? 'white' : 'var(--text-quaternary)',
                          background: newSmartFilterTagName.trim() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: newSmartFilterTagName.trim() ? 'pointer' : 'not-allowed',
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

      {/* Active Filters Summary */}
      {!smartFilterDescription && (selectedTagIds.length > 0 || lastActiveFilter !== 'all') && (
        <div style={{
          padding: '8px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--bg-secondary)',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            Filtered:
          </span>
          {selectedTagIds.map(tagId => {
            const tag = availableTags.find(t => t.id === tagId);
            if (!tag) return null;
            return (
              <span
                key={tagId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: tag.color || 'var(--text-secondary)',
                  background: tag.color ? `${tag.color}15` : 'var(--bg-tertiary)',
                  borderRadius: '4px',
                }}
              >
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: tag.color || 'var(--text-quaternary)',
                }} />
                {tag.name}
                <button
                  onClick={() => toggleTagFilter(tagId)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginLeft: '2px',
                    cursor: 'pointer',
                    color: 'inherit',
                    opacity: 0.6,
                  }}
                >
                  <CloseIcon size={10} />
                </button>
              </span>
            );
          })}
          {lastActiveFilter !== 'all' && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'var(--bg-tertiary)',
              borderRadius: '4px',
            }}>
              <ClockIcon size={10} />
              {LAST_ACTIVE_FILTERS.find(f => f.key === lastActiveFilter)?.label}
              <button
                onClick={() => setLastActiveFilter('all')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginLeft: '2px',
                  cursor: 'pointer',
                  color: 'inherit',
                  opacity: 0.6,
                }}
              >
                <CloseIcon size={10} />
              </button>
            </span>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>
            {sorted.length} result{sorted.length !== 1 ? 's' : ''}
          </span>
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
          {isLoading && sorted.length === 0 ? (
            <LoadingState isMobile={true} />
          ) : sorted.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              {search || selectedTagIds.length > 0 || lastActiveFilter !== 'all'
                ? 'No contacts match your filters'
                : 'No contacts yet'}
            </div>
          ) : (
            sorted.map((contact) => (
              <MobileContactCard
                key={contact.id}
                contact={contact}
                onClick={() => onSelect(contact)}
                isSelected={selectedContactIds.has(contact.id)}
                onToggleSelect={() => toggleSelectContact(contact.id)}
              />
            ))
          )}
        </div>
      ) : (
        /* Desktop Table View */
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-subtle)',
                zIndex: 10,
              }}>
                {/* Checkbox column */}
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

                {/* Name column */}
                <th style={{ ...thStyle, width: typeFilter === 'all' ? '22%' : '27%' }}>
                  <button onClick={() => handleSort('name')} style={thButtonStyle}>
                    Name
                    <SortIcon active={sortKey === 'name'} direction={sortDirection} />
                  </button>
                </th>

                {/* Type column - only when showing all types */}
                {typeFilter === 'all' && (
                  <th style={{ ...thStyle, width: '80px' }}>
                    <button onClick={() => handleSort('type')} style={thButtonStyle}>
                      Type
                      <SortIcon active={sortKey === 'type'} direction={sortDirection} />
                    </button>
                  </th>
                )}

                {/* Username */}
                <th style={{ ...thStyle, width: '120px' }}>Username</th>

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

                {/* Tags column - always visible */}
                <th style={{ ...thStyle, width: '150px' }}>Tags</th>

                {/* Messages - fixed width */}
                <th style={{ ...thStyle, width: '90px' }}>
                  <button onClick={() => handleSort('totalMessages')} style={thButtonStyle}>
                    Messages
                    <SortIcon active={sortKey === 'totalMessages'} direction={sortDirection} />
                  </button>
                </th>

                {/* Last Active - fixed width */}
                <th style={{ ...thStyle, width: '100px' }}>
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
              {isLoading && sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 0 }}>
                    <LoadingState isMobile={false} />
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    {search || selectedTagIds.length > 0 || lastActiveFilter !== 'all'
                      ? 'No contacts match your filters'
                      : 'No contacts yet'}
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
                    availableTags={availableTags}
                    onTagsChange={onTagsChange}
                    isSelected={selectedContactIds.has(contact.id)}
                    onToggleSelect={() => toggleSelectContact(contact.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// Loading Skeleton Components (Linear-style)
// ============================================

function SkeletonPulse({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: '4px',
        ...style,
      }}
    />
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

function DesktopSkeletonRow() {
  return (
    <tr>
      {/* Checkbox column */}
      <td style={{ padding: '12px 8px 12px 12px', width: '40px' }}>
        <SkeletonPulse style={{ width: '16px', height: '16px', borderRadius: '3px' }} />
      </td>

      {/* Name column */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SkeletonPulse style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <SkeletonPulse style={{ width: '120px', height: '13px' }} />
            <SkeletonPulse style={{ width: '80px', height: '11px' }} />
          </div>
        </div>
      </td>

      {/* Type column */}
      <td style={{ padding: '12px 16px' }}>
        <SkeletonPulse style={{ width: '60px', height: '13px' }} />
      </td>

      {/* Tags column */}
      <td style={{ padding: '12px 16px' }}>
        <SkeletonPulse style={{ width: '80px', height: '22px', borderRadius: '4px' }} />
      </td>

      {/* Phone column */}
      <td style={{ padding: '12px 16px' }}>
        <SkeletonPulse style={{ width: '100px', height: '13px' }} />
      </td>

      {/* Messages column */}
      <td style={{ padding: '12px 16px' }}>
        <SkeletonPulse style={{ width: '40px', height: '13px' }} />
      </td>

      {/* Last Active column */}
      <td style={{ padding: '12px 16px' }}>
        <SkeletonPulse style={{ width: '60px', height: '13px' }} />
      </td>
    </tr>
  );
}

function LoadingState({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <style>
        {`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}
      </style>

      {isMobile ? (
        <div>
          {[...Array(6)].map((_, i) => (
            <MobileSkeletonRow key={i} />
          ))}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <tbody>
            {[...Array(8)].map((_, i) => (
              <DesktopSkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      )}

      <p style={{
        marginTop: '16px',
        color: 'var(--text-tertiary)',
        fontSize: '13px',
      }}>
        Loading contacts...
      </p>
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
  availableTags: Tag[];
  onTagsChange?: (contactId: string, tags: { id: string; name: string; color: string | null }[]) => void;
  isSelected: boolean;
  onToggleSelect: () => void;
}

function ContactRow({ contact, onClick, typeFilter, showPhoneColumn, showMembersColumn, availableTags, onTagsChange, isSelected, onToggleSelect }: ContactRowProps) {
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
      {/* Checkbox */}
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

      {/* Name */}
      <td style={tdStyle}>
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

      {/* Type - only when showing all types */}
      {typeFilter === 'all' && (
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

      {/* Username */}
      <td style={tdStyle}>
        {contact.username ? (
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            @{contact.username}
          </span>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>—</span>
        )}
      </td>

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

      {/* Tags column with inline assignment */}
      <td style={tdStyle}>
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
      </td>

      {/* Messages */}
      <td style={tdStyle}>
        <span style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {contact.totalMessages.toLocaleString()}
        </span>
      </td>

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

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
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
  padding: '10px 16px',
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
