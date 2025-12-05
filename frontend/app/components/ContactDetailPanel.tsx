'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Contact } from './ContactsList';
import { formatRelativeTime } from '../lib/utils';
import Tooltip from './Tooltip';

interface ContactDetailPanelProps {
  contact: Contact | null;
  onOpenChat?: (contactId: string) => void;
  onExportMembers?: (contactId: string) => void;
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

export default function ContactDetailPanel({
  contact,
  onOpenChat,
  onExportMembers,
}: ContactDetailPanelProps) {
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaveStatus, setNotesSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [imageError, setImageError] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load notes when contact changes
  useEffect(() => {
    if (contact) {
      setNotes(contact.notes || '');
      setNotesSaveStatus('idle');
      setImageError(false);
    }
  }, [contact?.id]);

  // Auto-save notes with debounce
  const saveNotes = useCallback(async (newNotes: string) => {
    if (!contact) return;

    setNotesSaveStatus('saving');
    try {
      const response = await fetch(`/api/conversations/${contact.id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes }),
      });

      if (response.ok) {
        setNotesSaveStatus('saved');
        // Reset to idle after 2 seconds
        setTimeout(() => setNotesSaveStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Failed to save notes:', error);
      setNotesSaveStatus('idle');
    }
  }, [contact]);

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setNotes(newNotes);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save
    saveTimeoutRef.current = setTimeout(() => {
      saveNotes(newNotes);
    }, 1000);
  };

  if (!contact) {
    return (
      <div
        className="flex flex-col h-full items-center justify-center"
        style={{ background: 'var(--bg-secondary)', padding: 'var(--space-6)' }}
      >
        <div style={{
          width: '48px',
          height: '48px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-4)',
        }}>
          <UserIcon style={{ width: '24px', height: '24px', color: 'var(--text-quaternary)' }} />
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
          Select a contact to view details
        </p>
      </div>
    );
  }

  const isGroup = contact.type === 'group' || contact.type === 'supergroup';
  const isChannel = contact.type === 'channel';
  const hasAvatar = contact.avatarUrl && !imageError;
  const avatarColorScheme = getAvatarColor(contact.id);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header with Avatar */}
      <div style={{
        padding: 'var(--space-6)',
        borderBottom: '1px solid var(--border-subtle)',
        textAlign: 'center',
      }}>
        {/* Large Avatar */}
        <div style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}>
          {hasAvatar ? (
            <img
              src={contact.avatarUrl!.startsWith('/media/')
                ? `/api${contact.avatarUrl}`
                : contact.avatarUrl!}
              alt={contact.name}
              onError={() => setImageError(true)}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: 'var(--radius-full)',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: 'var(--radius-full)',
              background: avatarColorScheme.bg,
              color: avatarColorScheme.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'var(--font-bold)',
              fontSize: '24px',
            }}>
              {isGroup ? (
                <GroupIcon style={{ width: '32px', height: '32px' }} />
              ) : isChannel ? (
                <ChannelIcon style={{ width: '32px', height: '32px' }} />
              ) : (
                contact.initials
              )}
            </div>
          )}
        </div>

        {/* Name */}
        <h2 style={{
          fontSize: 'var(--title-md)',
          fontWeight: 'var(--font-semibold)',
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-1)',
        }}>
          {contact.name}
        </h2>

        {/* Username / Type */}
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
          {contact.username ? `@${contact.username}` : (
            isGroup ? 'Group' : isChannel ? 'Channel' : 'Private Chat'
          )}
        </p>

        {/* Online status for private chats */}
        {!isGroup && !isChannel && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: 'var(--space-2)',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: 'var(--radius-full)',
              background: contact.isOnline ? '#10b981' : 'var(--text-quaternary)',
            }} />
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {contact.isOnline ? 'Online' : (
                contact.lastSeenAt ? `Last seen ${formatRelativeTime(contact.lastSeenAt)}` : 'Offline'
              )}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
          <button
            onClick={() => onOpenChat?.(contact.id)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px 12px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'white',
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background 150ms ease',
            }}
          >
            <ChatIcon size={16} />
            Open Chat
          </button>
          {(isGroup || isChannel) && contact.hasMemberData && onExportMembers && (
            <Tooltip content="Export group members to CSV" position="bottom">
            <button
              onClick={() => onExportMembers(contact.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '10px 12px',
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              <ExportIcon size={16} />
            </button>
            </Tooltip>
          )}
        </div>

        {/* Insights Section */}
        <Section title="Insights">
          <InsightRow
            icon={<CalendarIcon size={16} />}
            label="First Contact"
            value={formatDate(contact.firstContactDate)}
          />
          <InsightRow
            icon={<ClockIcon size={16} />}
            label="Last Interaction"
            value={formatRelativeTime(contact.lastInteraction)}
          />
          <InsightRow
            icon={<MessageIcon size={16} />}
            label="Messages"
            value={`${contact.totalMessages.toLocaleString()} (${contact.messagesReceived} received, ${contact.messagesSent} sent)`}
          />
          {(isGroup || isChannel) && contact.memberCount && (
            <InsightRow
              icon={<GroupIcon style={{ width: '16px', height: '16px' }} />}
              label="Members"
              value={contact.memberCount.toLocaleString()}
            />
          )}
          {contact.phone && (
            <InsightRow
              icon={<PhoneIcon size={16} />}
              label="Phone"
              value={contact.phone}
            />
          )}
          {contact.email && (
            <InsightRow
              icon={<EmailIcon size={16} />}
              label="Email"
              value={contact.email}
            />
          )}
        </Section>

        {/* Tags Section */}
        <Section title="Labels">
          {contact.tags && contact.tags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {contact.tags.map((tag) => (
                <span
                  key={tag.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: tag.color || 'var(--text-secondary)',
                    background: tag.color ? `${tag.color}15` : 'var(--bg-tertiary)',
                    borderRadius: '6px',
                  }}
                >
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: 'var(--radius-full)',
                    background: tag.color || 'var(--text-quaternary)',
                  }} />
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-quaternary)', fontStyle: 'italic' }}>
              No labels assigned
            </p>
          )}
        </Section>

        {/* Notes Section */}
        <Section
          title="Notes"
          rightAction={
            notesSaveStatus === 'saving' ? (
              <span style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>Saving...</span>
            ) : notesSaveStatus === 'saved' ? (
              <span style={{ fontSize: '11px', color: 'var(--success)' }}>Saved</span>
            ) : null
          }
        >
          <textarea
            value={notes}
            onChange={handleNotesChange}
            placeholder="Add notes about this contact..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '12px',
              fontSize: '13px',
              fontFamily: 'inherit',
              color: 'var(--text-primary)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              resize: 'vertical',
              outline: 'none',
              transition: 'border-color 150ms ease',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
          />
        </Section>
      </div>
    </div>
  );
}

// ============================================
// Section Component
// ============================================

interface SectionProps {
  title: string;
  children: React.ReactNode;
  rightAction?: React.ReactNode;
}

function Section({ title, children, rightAction }: SectionProps) {
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-3)',
      }}>
        <h3 style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-quaternary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {title}
        </h3>
        {rightAction}
      </div>
      {children}
    </div>
  );
}

// ============================================
// Insight Row Component
// ============================================

interface InsightRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function InsightRow({ icon, label, value }: InsightRowProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      padding: '8px 0',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ color: 'var(--text-quaternary)', flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', minWidth: '100px' }}>
        {label}
      </span>
      <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function UserIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

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
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  );
}

function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10c0 .55-.45 1-1 1H4l-3 3V3c0-.55.45-1 1-1h11c.55 0 1 .45 1 1v7z" />
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

function CalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="1" />
      <path d="M5 1v2M11 1v2M2 7h12" />
    </svg>
  );
}

function ClockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4v4l2 2" />
    </svg>
  );
}

function MessageIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10c0 .55-.45 1-1 1H4l-3 3V3c0-.55.45-1 1-1h11c.55 0 1 .45 1 1v7z" />
    </svg>
  );
}

function PhoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 11.5v2a1 1 0 01-1 1h-1a10.5 10.5 0 01-10-10v-1a1 1 0 011-1h2l1 3-2 1.5a8 8 0 004 4l1.5-2 3 1z" />
    </svg>
  );
}

function EmailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="14" height="10" rx="1" />
      <path d="M1 3l7 5 7-5" />
    </svg>
  );
}
