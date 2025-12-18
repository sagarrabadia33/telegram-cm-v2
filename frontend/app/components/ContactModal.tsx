'use client';

import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Contact, Tag } from './ContactsTable';
import NotesTimeline, { notesCache } from './NotesTimeline';
import { MessageBubble, MessageInputWrapper, groupMessagesByDate, LoadingSpinner } from './MessageView';
import { Message } from '../types/index';
import { formatDate } from '../lib/utils';
import { track } from '@/app/lib/analytics/client';

// ============================================================================
// TYPES
// ============================================================================

interface ContactModalProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onTagsChange?: (contactId: string, tags: Tag[]) => void;
  allTags?: Tag[];
}

type ModalTab = 'conversation' | 'notes' | 'ai';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_WIDTH_PERCENT = 28;
const MAX_WIDTH_PERCENT = 65;
const DEFAULT_WIDTH_PERCENT = 33;

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

// Tone presets for draft
type TonePreset = 'casual' | 'professional' | 'friendly' | 'brief';

const TONE_PRESETS: { id: TonePreset; label: string; description: string }[] = [
  { id: 'casual', label: 'Casual', description: "Natural, relaxed style" },
  { id: 'professional', label: 'Professional', description: 'Formal but warm' },
  { id: 'friendly', label: 'Friendly', description: 'Upbeat, positive' },
  { id: 'brief', label: 'Brief', description: 'Short and punchy' },
];

// ============================================================================
// HELPERS
// ============================================================================

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
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// Parse days waiting from status reason
function parseDaysWaiting(statusReason: string | null): number {
  if (!statusReason) return 0;
  const match = statusReason.match(/^\[(\d+)d waiting\]/);
  return match ? parseInt(match[1], 10) : 0;
}

// Get clean summary without days prefix
function getCleanSummary(statusReason: string | null): string {
  if (!statusReason) return '';
  return statusReason.replace(/^\[\d+d waiting\]\s*/, '').trim();
}

function getUrgencyColor(status: string | null, daysInactive: number): string {
  if (daysInactive >= 7) return '#DC2626';
  if (daysInactive >= 5) return '#EF4444';
  if (daysInactive >= 3) return '#F97316';

  switch (status) {
    case 'needs_owner': return '#EF4444';
    case 'at_risk': return '#F97316';
    case 'team_handling': return '#3B82F6';
    case 'resolved': return '#22C55E';
    case 'monitoring': return '#22C55E';
    default: return 'var(--text-tertiary)';
  }
}

function getUrgencyBgColor(status: string | null, daysInactive: number): string {
  if (daysInactive >= 7) return 'rgba(220, 38, 38, 0.12)';
  if (daysInactive >= 5) return 'rgba(239, 68, 68, 0.12)';
  if (daysInactive >= 3) return 'rgba(249, 115, 22, 0.12)';

  switch (status) {
    case 'needs_owner': return 'rgba(239, 68, 68, 0.12)';
    case 'at_risk': return 'rgba(249, 115, 22, 0.12)';
    case 'team_handling': return 'rgba(59, 130, 246, 0.12)';
    case 'resolved': return 'rgba(34, 197, 94, 0.12)';
    case 'monitoring': return 'rgba(107, 114, 128, 0.08)';
    default: return 'rgba(107, 114, 128, 0.08)';
  }
}

// AI Action types (includes Customer, Customer Groups, Partner, Churned, and Prospect actions)
type AiAction =
  // Customer Groups actions (team handles)
  | 'Reply Now' | 'Schedule Call' | 'Send Resource' | 'Check In' | 'Escalate' | 'On Track' | 'Monitor'
  // Customer actions (Shalin's direct relationships)
  | 'Personal Check-in' | 'Address Concern' | 'Discuss Renewal' | 'Resolve Issue' | 'Strengthen Relationship'
  // Partner actions
  | 'Send Intro' | 'Follow Up' | 'Nurture'
  // Churned win-back actions
  | 'Win Back Call' | 'Send Offer' | 'Personal Outreach' | 'Final Attempt' | 'Close File' | 'Celebrate Win'
  // Prospect sales actions
  | 'Book Demo' | 'Send Follow-up' | 'Share Case Study' | 'Send Proposal' | 'Close Deal' | 'Re-engage'
  | null;

// Get action label - PRIORITY: Use AI's actual action recommendation when available
function getActionLabelFromAI(aiAction: AiAction, status: string | null, daysInactive: number): string {
  // PRIORITY 1: Use AI's actual action recommendation if available
  if (aiAction) {
    return aiAction; // "Reply Now", "Schedule Call", "Send Resource", etc.
  }

  // PRIORITY 2: Time-based urgency when no AI recommendation
  if (daysInactive >= 7) return 'Reply now';
  if (daysInactive >= 5) return 'Follow up';
  if (daysInactive >= 3) return 'Check in';

  // PRIORITY 3: Status-based fallback
  switch (status) {
    case 'needs_owner': return 'Escalate';
    case 'at_risk': return 'Follow up';
    case 'team_handling': return 'In progress';
    case 'resolved': return 'On track';
    case 'monitoring': return 'Monitor';
    default: return 'Review';
  }
}

// Legacy function for backward compatibility
function getActionLabel(status: string | null, daysInactive: number): string {
  return getActionLabelFromAI(null, status, daysInactive);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ContactModal({
  contact,
  isOpen,
  onClose,
  onTagsChange,
  allTags: propAllTags,
}: ContactModalProps) {
  // Panel state
  const [widthPercent, setWidthPercent] = useState(DEFAULT_WIDTH_PERCENT);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>('conversation');
  const [imageError, setImageError] = useState(false);

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Draft reply state
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [selectedTone, setSelectedTone] = useState<TonePreset>('casual');

  // Tags state
  const [localAllTags, setLocalAllTags] = useState<Tag[]>([]);

  // Notes count for badge
  const [notesCount, setNotesCount] = useState(0);

  // Eagerly fetch notes count when modal opens (so badge shows immediately)
  useEffect(() => {
    if (!contact?.id || !isOpen) return;

    // Check cache first for instant display
    if (notesCache.has(contact.id)) {
      const cached = notesCache.get(contact.id);
      if (cached) {
        setNotesCount(cached.notes.length);
        return; // Cache hit - no need to fetch
      }
    }

    // No cache - fetch count from API
    const fetchNotesCount = async () => {
      try {
        const response = await fetch(`/api/conversations/${contact.id}/notes`);
        const data = await response.json();
        if (data.success) {
          const count = data.data.notes?.length || 0;
          setNotesCount(count);
          // Store in cache so NotesTimeline gets it instantly when tab opens
          notesCache.set(contact.id, {
            notes: data.data.notes || [],
            fetchedAt: Date.now(),
          });
        }
      } catch (error) {
        console.error('Failed to fetch notes count:', error);
      }
    };
    fetchNotesCount();
  }, [contact?.id, isOpen]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const prevScrollHeightRef = useRef<number>(0);
  const isLoadingOlderRef = useRef(false);
  const shouldScrollToBottom = useRef(true);

  // Use prop tags if available
  const allTags = propAllTags || localAllTags;
  const contactTags = contact?.tags || [];

  // Calculate days inactive from contact data
  const daysInactive = contact?.aiStatusReason
    ? parseDaysWaiting(contact.aiStatusReason)
    : Math.floor((Date.now() - new Date(contact?.lastInteraction || Date.now()).getTime()) / (1000 * 60 * 60 * 24));

  // ============================================================================
  // RESIZE HANDLING
  // ============================================================================

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      setWidthPercent(Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // Fetch messages
  const fetchMessages = useCallback(async (cursor?: string, isInitialLoad: boolean = false) => {
    if (!contact?.id) return;

    try {
      const params = new URLSearchParams({
        limit: '50',
        ...(cursor && { cursor }),
      });

      const res = await fetch(`/api/conversations/${contact.id}/messages?${params}`);
      if (!res.ok) throw new Error('Failed to fetch messages');

      const data = await res.json();

      if (cursor) {
        // Loading older messages - prepend to existing (API returns chronological order)
        setMessages(prev => [...data.messages, ...prev]);
      } else if (isInitialLoad) {
        // Initial load - replace all messages and scroll to bottom
        setMessages(data.messages);
        shouldScrollToBottom.current = true;
      } else {
        // Polling - merge new messages if any (don't replace to preserve loaded history)
        setMessages(prev => {
          if (prev.length === 0) return data.messages;

          // Find messages newer than our newest
          const newestId = prev[prev.length - 1]?.id;
          const newestTime = prev[prev.length - 1]?.time;

          // Filter for truly new messages
          const newMessages = data.messages.filter((msg: { id: string; time: string }) => {
            // Check if message is newer than our newest
            return new Date(msg.time) > new Date(newestTime) && !prev.some(p => p.id === msg.id);
          });

          if (newMessages.length > 0) {
            return [...prev, ...newMessages];
          }
          return prev;
        });
      }

      // Only update hasMore on initial/cursor loads, not polling
      if (cursor || isInitialLoad) {
        setHasMore(data.hasMore || false);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setIsLoadingMessages(false);
      setIsLoadingMore(false);
    }
  }, [contact?.id]);

  // Fetch tags
  useEffect(() => {
    if (propAllTags) return;

    const fetchTags = async () => {
      try {
        const response = await fetch('/api/tags');
        const data = await response.json();
        if (data.success) {
          setLocalAllTags(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch tags:', error);
      }
    };
    fetchTags();
  }, [propAllTags]);

  // Initial load when contact changes or modal opens
  useEffect(() => {
    if (!contact?.id || !isOpen) return;

    setIsLoadingMessages(true);
    setMessages([]);
    setImageError(false);
    setActiveTab('conversation');
    setInputValue('');
    shouldScrollToBottom.current = true;
    prevMessagesLengthRef.current = 0;

    fetchMessages(undefined, true); // isInitialLoad = true
  }, [contact?.id, isOpen, fetchMessages]);

  // Refetch when switching to conversation tab
  useEffect(() => {
    if (activeTab === 'conversation' && contact?.id && isOpen) {
      shouldScrollToBottom.current = true;
      fetchMessages(undefined, true); // isInitialLoad = true to refresh and scroll
    }
  }, [activeTab]);

  // Poll for new messages
  useEffect(() => {
    if (!contact?.id || !isOpen || activeTab !== 'conversation') return;

    const interval = setInterval(() => {
      fetchMessages();
    }, 5000);

    return () => clearInterval(interval);
  }, [contact?.id, isOpen, activeTab, fetchMessages]);

  // ============================================================================
  // SCROLL BEHAVIOR
  // ============================================================================

  useLayoutEffect(() => {
    if (!messagesEndRef.current || !messagesContainerRef.current) return;

    const isNewMessage = messages.length > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0;

    if (shouldScrollToBottom.current || (prevMessagesLengthRef.current === 0 && messages.length > 0)) {
      // Initial load or tab switch: instant scroll to bottom
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      shouldScrollToBottom.current = false;
      isLoadingOlderRef.current = false;
    } else if (isNewMessage && !isLoadingOlderRef.current) {
      // New message received: smooth scroll
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    } else if (isLoadingOlderRef.current) {
      // Older messages loaded: preserve scroll position
      const newScrollHeight = messagesContainerRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
      messagesContainerRef.current.scrollTop += scrollDiff;
      isLoadingOlderRef.current = false;
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  // Intersection observer for loading older messages
  useEffect(() => {
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          if (messagesContainerRef.current) {
            prevScrollHeightRef.current = messagesContainerRef.current.scrollHeight;
          }
          isLoadingOlderRef.current = true;
          setIsLoadingMore(true);
          const oldestMessage = messages[0];
          if (oldestMessage) {
            fetchMessages(oldestMessage.id);
          }
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, messages, fetchMessages]);

  // ============================================================================
  // MESSAGE HANDLERS
  // ============================================================================

  const handleSendMessage = async (text: string) => {
    if (!contact?.id || !text.trim()) return;

    try {
      const res = await fetch(`/api/conversations/${contact.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (res.ok) {
        shouldScrollToBottom.current = true;
        fetchMessages();
        setInputValue('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        track('message_sent', {
          conversationId: contact.id,
          hasAttachment: false,
          contentLength: text.trim().length,
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleSendWithAttachment = async (
    text: string,
    attachment: { type: string; url: string; filename?: string; mimeType: string }
  ) => {
    if (!contact?.id) return;

    try {
      const res = await fetch(`/api/conversations/${contact.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), attachment }),
      });

      if (res.ok) {
        shouldScrollToBottom.current = true;
        fetchMessages();
        setInputValue('');
        track('message_sent', {
          conversationId: contact.id,
          hasAttachment: true,
          contentLength: text.trim().length,
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleReact = async (messageId: string, emoji: string, action: 'add' | 'remove') => {
    if (!contact?.id) return;

    try {
      await fetch(`/api/conversations/${contact.id}/messages/${messageId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, action }),
      });
      fetchMessages();
    } catch (err) {
      console.error('Failed to react:', err);
    }
  };

  // ============================================================================
  // DRAFT REPLY
  // ============================================================================

  const generateDraft = async (tone: TonePreset) => {
    if (!contact?.id) return;

    try {
      setIsGeneratingDraft(true);
      setShowToneMenu(false);

      const res = await fetch(`/api/inbox-zero/draft/${contact.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone }),
      });

      const data = await res.json();

      if (res.ok && data.draft && data.draft !== '[NO_REPLY_NEEDED]') {
        setInputValue(data.draft);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to generate draft:', err);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // ============================================================================
  // KEYBOARD & ESCAPE
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!contact || !isOpen) return null;

  const isGroup = contact.type === 'group' || contact.type === 'supergroup';
  const isChannel = contact.type === 'channel';
  const hasAvatar = contact.avatarUrl && !imageError;
  const avatarColorScheme = getAvatarColor(contact.id);
  const groupedMessages = groupMessagesByDate(messages);
  const urgencyColor = getUrgencyColor(contact.aiStatus, daysInactive);
  const urgencyBg = getUrgencyBgColor(contact.aiStatus, daysInactive);
  // CRITICAL FIX: Use AI's actual action recommendation instead of hardcoded logic
  const actionLabel = getActionLabelFromAI(contact.aiAction, contact.aiStatus, daysInactive);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 50,
        }}
      />

      {/* Modal Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: `${widthPercent}%`,
          minWidth: '420px',
          maxWidth: '900px',
          background: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border-subtle)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '4px',
            cursor: 'ew-resize',
            background: isResizing ? 'var(--accent-primary)' : 'transparent',
            transition: 'background 150ms ease',
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            if (!isResizing) e.currentTarget.style.background = 'var(--border-default)';
          }}
          onMouseLeave={(e) => {
            if (!isResizing) e.currentTarget.style.background = 'transparent';
          }}
        />

        {/* ================================================================ */}
        {/* HEADER - Linear Design System */}
        {/* ================================================================ */}
        <div style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-primary)',
        }}>
          {/* Top Row: Avatar, Title, Tabs, Close */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px 12px',
          }}>
            {/* Avatar */}
            {hasAvatar ? (
              <img
                src={contact.avatarUrl!.startsWith('/media/')
                  ? `/api${contact.avatarUrl}`
                  : contact.avatarUrl!}
                alt={contact.name}
                onError={() => setImageError(true)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: avatarColorScheme.bg,
                color: avatarColorScheme.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '13px',
                flexShrink: 0,
              }}>
                {isGroup ? <GroupIcon size={18} /> : isChannel ? <ChannelIcon size={18} /> : contact.initials}
              </div>
            )}

            {/* Title & Meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {contact.name}
                </h2>

                {/* Export Members - Icon only, tooltip on hover */}
                {isGroup && (
                  <div style={{ position: 'relative' }} className="export-trigger">
                    <button
                      onClick={() => {
                        window.open(`/api/conversations/${contact.id}/members/export`, '_blank');
                      }}
                      aria-label="Export group members to CSV"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px',
                        color: 'var(--text-quaternary)',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 100ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                        if (tooltip) tooltip.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-quaternary)';
                        const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                        if (tooltip) tooltip.style.opacity = '0';
                      }}
                    >
                      <ExportIcon size={13} />
                    </button>
                    {/* Tooltip */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginTop: '6px',
                        padding: '5px 8px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        opacity: 0,
                        pointerEvents: 'none',
                        transition: 'opacity 150ms ease',
                        zIndex: 100,
                      }}
                    >
                      Export members to CSV
                    </div>
                  </div>
                )}
              </div>
              <div style={{
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                marginTop: '2px',
              }}>
                {isGroup ? (
                  <>Last message {formatRelativeTime(contact.lastInteraction)} · {contact.memberCount?.toLocaleString()} members</>
                ) : contact.isOnline ? (
                  <span style={{ color: '#22C55E' }}>Online</span>
                ) : (
                  <>Last active {formatRelativeTime(contact.lastInteraction)}</>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex',
              background: 'var(--bg-tertiary)',
              borderRadius: '6px',
              padding: '2px',
            }}>
              <TabButton active={activeTab === 'conversation'} onClick={() => setActiveTab('conversation')}>
                Chat
              </TabButton>
              <TabButton
                active={activeTab === 'notes'}
                onClick={() => setActiveTab('notes')}
                badge={notesCount}
              >
                Notes
              </TabButton>
              <TabButton
                active={activeTab === 'ai'}
                onClick={() => setActiveTab('ai')}
              >
                AI
              </TabButton>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              style={{
                padding: '6px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Tags Row */}
          <div style={{
            padding: '0 20px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            {contactTags.map((tag) => (
              <span
                key={tag.id}
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
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: tag.color || 'var(--text-quaternary)',
                }} />
                {tag.name}
              </span>
            ))}
          </div>

          {/* AI Context Card - Linear Style: Action-first design */}
          <div style={{
            margin: '0 16px 12px',
            padding: '12px',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
          }}>
            {/* Action Row - Primary focus with inline Draft button */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              {/* Status Badge - matches ContactsTable action column */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: urgencyBg,
                fontSize: '12px',
                fontWeight: 500,
                color: urgencyColor,
                flexShrink: 0,
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: urgencyColor,
                }} />
                {actionLabel}
                {daysInactive > 0 && (
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '1px 4px',
                    borderRadius: '3px',
                    background: urgencyColor,
                    color: '#fff',
                    marginLeft: '2px',
                  }}>
                    {daysInactive}d
                  </span>
                )}
              </span>

              {/* Negative sentiment only - actionable signal */}
              {contact.aiSentiment === 'negative' && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 500,
                  borderRadius: '4px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#EF4444',
                  flexShrink: 0,
                }}>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: 'currentColor',
                  }} />
                  At risk
                </span>
              )}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Draft Reply - inline with action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                <button
                  onClick={() => generateDraft(selectedTone)}
                  disabled={isGeneratingDraft}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    background: isGeneratingDraft ? 'var(--bg-tertiary)' : 'var(--accent-subtle)',
                    color: isGeneratingDraft ? 'var(--text-tertiary)' : 'var(--accent-primary)',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: isGeneratingDraft ? 'wait' : 'pointer',
                    transition: 'all 100ms ease',
                  }}
                >
                  {isGeneratingDraft ? (
                    <>
                      <LoadingSpinner size={10} />
                      <span>...</span>
                    </>
                  ) : (
                    <>
                      <SparkleIcon />
                      Draft
                    </>
                  )}
                </button>

                {/* Tone Selector - compact */}
                <button
                  onClick={() => setShowToneMenu(!showToneMenu)}
                  disabled={isGeneratingDraft}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 6px',
                    background: showToneMenu ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '5px',
                    cursor: isGeneratingDraft ? 'not-allowed' : 'pointer',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  <ChevronDownIcon />
                </button>

                {showToneMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                    zIndex: 20,
                    minWidth: '130px',
                    overflow: 'hidden',
                  }}>
                    {TONE_PRESETS.map((tone) => (
                      <button
                        key={tone.id}
                        onClick={() => {
                          setSelectedTone(tone.id);
                          generateDraft(tone.id);
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          background: selectedTone === tone.id ? 'var(--bg-hover)' : 'transparent',
                          border: 'none',
                          borderLeft: selectedTone === tone.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {tone.label}
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--text-quaternary)' }}>
                          {tone.description}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Suggested action - what to do */}
            {contact.aiSuggestedAction && (
              <div style={{ marginTop: '10px' }}>
                <div style={{
                  fontSize: '9px',
                  fontWeight: 500,
                  color: 'var(--text-quaternary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '4px',
                }}>
                  Action
                </div>
                <div style={{
                  fontSize: '12px',
                  lineHeight: 1.5,
                  color: 'var(--text-primary)',
                }}>
                  {contact.aiSuggestedAction}
                </div>
              </div>
            )}

            {/* Summary - context, lighter weight */}
            {contact.aiSummary && (
              <div style={{
                marginTop: '10px',
                paddingTop: '10px',
                borderTop: '1px solid var(--border-subtle)',
              }}>
                <div style={{
                  fontSize: '9px',
                  fontWeight: 500,
                  color: 'var(--text-quaternary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '4px',
                }}>
                  Context
                </div>
                <div style={{
                  fontSize: '11px',
                  lineHeight: 1.5,
                  color: 'var(--text-tertiary)',
                }}>
                  {contact.aiSummary}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================================================================ */}
        {/* CONTENT AREA */}
        {/* ================================================================ */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}>
          {activeTab === 'conversation' ? (
            <>
              {/* Messages Area - Compact font size */}
              <div
                ref={messagesContainerRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  fontSize: '13px', // Slightly smaller for density
                }}
              >
                {/* Load more trigger */}
                {hasMore && (
                  <div ref={loadMoreTriggerRef} style={{ padding: '6px 0', textAlign: 'center' }}>
                    {isLoadingMore ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <LoadingSpinner size={12} />
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Loading...</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--text-quaternary)' }}>↑ Scroll for older</span>
                    )}
                  </div>
                )}

                {isLoadingMessages ? (
                  <MessagesLoadingSkeleton />
                ) : messages.length === 0 ? (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: '12px',
                  }}>
                    No messages yet
                  </div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.date}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px 0',
                      }}>
                        <span style={{
                          fontSize: '10px',
                          color: 'var(--text-quaternary)',
                          background: 'var(--bg-secondary)',
                          padding: '2px 8px',
                          borderRadius: '10px',
                        }}>
                          {formatDate(group.date)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        {group.messages.map((message) => (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            isGroup={isGroup}
                            onReact={handleReact}
                            compact={true}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div style={{
                padding: '10px 12px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
              }}>
                <MessageInputWrapper
                  textareaRef={textareaRef}
                  inputValue={inputValue}
                  onInputChange={(e) => {
                    setInputValue(e.target.value);
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(inputValue);
                    }
                  }}
                  onSend={() => handleSendMessage(inputValue)}
                  onSendWithAttachment={handleSendWithAttachment}
                  conversationId={contact.id}
                  isGroup={isGroup}
                />
              </div>
            </>
          ) : activeTab === 'notes' ? (
            /* Notes Tab - Linear style matching AI Assistant */
            <div style={{
              flex: 1,
              overflowY: 'auto',
            }}>
              <NotesTimeline
                conversationId={contact.id}
                isExpanded={true}
                onToggleExpanded={() => {}}
                onNotesCountChange={setNotesCount}
                fullHeight={true}
              />
            </div>
          ) : (
            /* AI Tab - Quick research assistant */
            <ContactAIChat
              contact={contact}
            />
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TabButton({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '5px 12px',
        fontSize: '11px',
        fontWeight: 500,
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        background: active ? 'var(--bg-primary)' : 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span style={{
          fontSize: '9px',
          fontWeight: 600,
          color: 'var(--accent-primary)',
          background: 'var(--accent-subtle)',
          padding: '1px 4px',
          borderRadius: '8px',
          minWidth: '14px',
          textAlign: 'center',
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// ICONS
// ============================================================================

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M11 3L3 11M3 3l8 8" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3.75L5 6.25L7.5 3.75" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1L9.17 5.83L14 7L9.17 8.17L8 13L6.83 8.17L2 7L6.83 5.83L8 1Z" />
    </svg>
  );
}

function GroupIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ChannelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function ExportIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Message Skeleton for loading state - Linear style
function MessageSkeleton({ sent = false }: { sent?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: sent ? 'flex-end' : 'flex-start',
        padding: '2px 0',
      }}
    >
      <div
        style={{
          maxWidth: '65%',
          minWidth: '120px',
          padding: '10px 14px',
          borderRadius: '12px',
          borderBottomRightRadius: sent ? '4px' : '12px',
          borderBottomLeftRadius: sent ? '12px' : '4px',
          background: sent ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
        }}
      >
        {/* Text lines skeleton */}
        <div
          style={{
            height: '10px',
            width: '100%',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            marginBottom: '6px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            height: '10px',
            width: '70%',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: '0.2s',
          }}
        />
        {/* Timestamp skeleton */}
        <div
          style={{
            height: '8px',
            width: '40px',
            background: 'var(--bg-tertiary)',
            borderRadius: '3px',
            marginTop: '6px',
            marginLeft: sent ? 'auto' : '0',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: '0.4s',
          }}
        />
      </div>
    </div>
  );
}

// Skeleton loading for messages area
function MessagesLoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
      <MessageSkeleton sent={false} />
      <MessageSkeleton sent={true} />
      <MessageSkeleton sent={false} />
      <MessageSkeleton sent={true} />
      <MessageSkeleton sent={false} />
      <MessageSkeleton sent={true} />
      <MessageSkeleton sent={false} />
    </div>
  );
}

// ============================================================================
// AI CHAT COMPONENT - Quick research before diving into conversation
// ============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Smart question suggestions based on contact context
function getSmartSuggestions(contact: Contact): string[] {
  const tags = contact.tags || [];
  const tagNames = tags.map(t => t.name.toLowerCase());

  // Check AI analysis state
  const aiAction = contact.aiAction;
  const aiUrgency = contact.aiUrgencyLevel;

  // High urgency - need to act fast
  if (aiUrgency === 'critical' || aiUrgency === 'high') {
    return [
      'What\'s the urgent issue I need to address?',
      'What context do I need before responding?',
      'Draft a response to address their concern',
    ];
  }

  // Customer Groups specific
  if (tagNames.includes('customer groups') || tagNames.includes('customer')) {
    return [
      'What are their open issues or questions?',
      'What\'s their sentiment and engagement level?',
      'Any churn risk signals I should know about?',
    ];
  }

  // Partner specific
  if (tagNames.includes('partner')) {
    return [
      'Summarize our partnership status',
      'What commitments or deliverables are pending?',
      'How can I strengthen this relationship?',
    ];
  }

  // Needs follow-up
  if (aiAction === 'Reply Now' || aiAction === 'Check In') {
    return [
      'What do they need from me?',
      'What was the last thing we discussed?',
      'Draft a follow-up message',
    ];
  }

  // Default - general research
  return [
    'Give me a quick brief on this contact',
    'What are the key topics we\'ve discussed?',
    'Any action items or pending requests?',
  ];
}

// Session-based AI chat cache - persists while app is open
// Same pattern as notesCache for instant switching between contacts
const aiChatCache = new Map<string, ChatMessage[]>();

function ContactAIChat({ contact }: { contact: Contact }) {
  // Initialize from cache if available (instant restore)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return aiChatCache.get(contact.id) || [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = getSmartSuggestions(contact);

  // Persist messages to cache whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      aiChatCache.set(contact.id, messages);
    }
  }, [messages, contact.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`/api/conversations/${contact.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chatHistory: messages.map(m => ({ role: m.role, content: m.content })),
          deepAnalysis: true, // Always use full context for contact research
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.data.response,
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Show error as assistant message
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I couldn\'t process that request. Please try again.',
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Connection error. Please try again.',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {messages.length === 0 ? (
          // Empty state with suggestions
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '20px',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--accent-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <SparkleIcon />
            </div>
            <div style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              maxWidth: '240px',
            }}>
              Ask me anything about this contact before diving in
            </div>

            {/* Smart suggestions */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              width: '100%',
              maxWidth: '300px',
            }}>
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(suggestion)}
                  style={{
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-secondary)';
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Chat messages
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  borderBottomRightRadius: msg.role === 'user' ? '4px' : '12px',
                  borderBottomLeftRadius: msg.role === 'user' ? '12px' : '4px',
                  background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                  color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  borderBottomLeftRadius: '4px',
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  gap: '4px',
                }}>
                  <span className="ai-typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-quaternary)', animation: 'pulse 1s infinite' }} />
                  <span className="ai-typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-quaternary)', animation: 'pulse 1s infinite', animationDelay: '0.2s' }} />
                  <span className="ai-typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-quaternary)', animation: 'pulse 1s infinite', animationDelay: '0.4s' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          {/* New chat button - only shows when there's history */}
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                aiChatCache.delete(contact.id);
              }}
              title="Start new chat"
              style={{
                padding: '10px',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask about this contact..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              outline: 'none',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            style={{
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              color: !input.trim() || isLoading ? 'var(--text-quaternary)' : 'white',
              background: !input.trim() || isLoading ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
              border: 'none',
              borderRadius: '8px',
              cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
