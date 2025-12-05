'use client';

import { useState, useEffect, useMemo } from 'react';
import { SearchIcon } from './Icons';
import { formatRelativeTime } from '../lib/utils';
import Tooltip from './Tooltip';

// Contact type from API
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

interface ContactsListProps {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (contact: Contact) => void;
  typeFilter: 'all' | 'people' | 'groups' | 'channels';
  onTypeFilterChange: (filter: 'all' | 'people' | 'groups' | 'channels') => void;
  counts: { all: number; people: number; groups: number; channels: number };
  onExportCsv?: () => void;
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

export default function ContactsList({
  contacts,
  selectedId,
  onSelect,
  typeFilter,
  onTypeFilterChange,
  counts,
  onExportCsv,
}: ContactsListProps) {
  const [search, setSearch] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Filter contacts by search
  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const query = search.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.username?.toLowerCase().includes(query) ||
      c.phone?.includes(query)
    );
  }, [contacts, search]);

  const filterTabs = [
    { key: 'all' as const, label: 'All', count: counts.all },
    { key: 'people' as const, label: 'People', count: counts.people },
    { key: 'groups' as const, label: 'Groups', count: counts.groups },
    { key: 'channels' as const, label: 'Channels', count: counts.channels },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
        {/* Top row: Title + Export */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <h1 style={{
            fontSize: 'var(--title-md)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Contacts
          </h1>

          {/* Export Button */}
          {onExportCsv && (
            <Tooltip content="Export contacts to CSV" position="bottom">
              <button
                onClick={onExportCsv}
                style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }}
            >
              <ExportIcon size={14} />
              Export
              </button>
            </Tooltip>
          )}
        </div>

        {/* Search */}
        <div className="relative" style={{ marginBottom: 'var(--space-3)' }}>
          <SearchIcon
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: 'var(--space-3)', color: 'var(--text-quaternary)', width: '18px', height: '18px' }}
          />
          <input
            type="text"
            placeholder="Search contacts..."
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

        {/* Type Filters - Linear-style segmented control */}
        <div style={{
          display: 'flex',
          gap: '2px',
          padding: '2px',
          background: 'var(--bg-tertiary)',
          borderRadius: '8px',
        }}>
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTypeFilterChange(tab.key)}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '12px',
                fontWeight: 500,
                color: typeFilter === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: typeFilter === tab.key ? 'var(--bg-primary)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                boxShadow: typeFilter === tab.key ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {tab.label}
              <span style={{
                marginLeft: '4px',
                color: typeFilter === tab.key ? 'var(--text-tertiary)' : 'var(--text-quaternary)',
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Contacts List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
              {search ? 'No contacts found' : 'No contacts yet'}
            </p>
          </div>
        ) : (
          filtered.map((contact) => (
            <ContactItem
              key={contact.id}
              contact={contact}
              isSelected={contact.id === selectedId}
              onClick={() => onSelect(contact)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// Contact Item
// ============================================

interface ContactItemProps {
  contact: Contact;
  isSelected: boolean;
  onClick: () => void;
}

function ContactItem({ contact, isSelected, onClick }: ContactItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);

  const isGroup = contact.type === 'group' || contact.type === 'supergroup';
  const isChannel = contact.type === 'channel';
  const hasAvatar = contact.avatarUrl && !imageError;
  const avatarColorScheme = getAvatarColor(contact.id);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
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
          <img
            src={contact.avatarUrl!.startsWith('/media/')
              ? `/api${contact.avatarUrl}`
              : contact.avatarUrl!}
            alt={contact.name}
            onError={() => setImageError(true)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full)',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-full)',
            background: avatarColorScheme.bg,
            color: avatarColorScheme.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'var(--font-semibold)',
            fontSize: 'var(--text-sm)',
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
        {/* Online indicator for private chats */}
        {!isGroup && !isChannel && contact.isOnline && (
          <div style={{
            position: 'absolute',
            bottom: '1px',
            right: '1px',
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
          marginBottom: '2px',
        }}>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-medium)',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {contact.name}
          </span>
          {/* Message count badge */}
          <span style={{
            fontSize: '10px',
            color: 'var(--text-quaternary)',
            flexShrink: 0,
          }}>
            {contact.totalMessages} msgs
          </span>
        </div>

        {/* Subtitle: username or type info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}>
          {contact.username && (
            <span style={{
              fontSize: '11px',
              color: 'var(--text-tertiary)',
            }}>
              @{contact.username}
            </span>
          )}
          {(isGroup || isChannel) && contact.memberCount && (
            <span style={{
              fontSize: '11px',
              color: 'var(--text-quaternary)',
            }}>
              {contact.memberCount.toLocaleString()} members
            </span>
          )}
          {!isGroup && !isChannel && contact.phone && (
            <span style={{
              fontSize: '11px',
              color: 'var(--text-quaternary)',
            }}>
              {contact.phone}
            </span>
          )}
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: 'var(--space-1)',
            flexWrap: 'wrap',
          }}>
            {contact.tags.slice(0, 2).map((tag) => (
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
                  width: '4px',
                  height: '4px',
                  borderRadius: 'var(--radius-full)',
                  background: tag.color || 'var(--text-quaternary)',
                }} />
                {tag.name}
              </span>
            ))}
            {contact.tags.length > 2 && (
              <span style={{ fontSize: '10px', color: 'var(--text-quaternary)' }}>
                +{contact.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
      <path d="M19 12H5M12 19l-7-7 7-7" />
      <path d="M12 5v14" />
    </svg>
  );
}

function ExportIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" />
      <path d="M8 2v8" />
      <path d="M4 6l4-4 4 4" />
    </svg>
  );
}
