'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Contact } from './ContactsTable';
import Tooltip from './Tooltip';
import NotesTimeline from './NotesTimeline';

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

// Tag type for management
interface Tag {
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

// Tag preset colors
const TAG_COLORS = [
  '#E17076', '#FAA774', '#A695E7', '#7BC862',
  '#6EC9CB', '#65AADD', '#EE7AAE', '#F59E0B',
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
  return formatDate(dateString);
}

interface ContactSlidePanelProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenChat: (contactId: string) => void;
  onTagsChange?: (contactId: string, tags: Tag[]) => void;
  allTags?: Tag[];
}

export default function ContactSlidePanel({
  contact,
  isOpen,
  onClose,
  onOpenChat,
  onTagsChange,
  allTags: propAllTags,
}: ContactSlidePanelProps) {
  const isMobile = useIsMobile();
  const [imageError, setImageError] = useState(false);
  // Draft reply state
  const [draftReply, setDraftReply] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [selectedTone, setSelectedTone] = useState<'professional' | 'friendly' | 'casual'>('professional');
  const [showToneDropdown, setShowToneDropdown] = useState(false);
  const [localAllTags, setLocalAllTags] = useState<Tag[]>([]);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  // Initialize with default position - will be updated on open
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const tagButtonRef = useRef<HTMLButtonElement>(null);
  const tagSearchInputRef = useRef<HTMLInputElement>(null);
  const toneDropdownRef = useRef<HTMLDivElement>(null);

  // Use prop tags if available, otherwise use locally fetched tags
  const allTags = propAllTags || localAllTags;

  // Use contact.tags directly from props - don't maintain separate local state
  // This ensures instant sync when parent updates the contact
  const contactTags = contact?.tags || [];

  // Reset UI state when contact changes
  useEffect(() => {
    if (contact) {
      setImageError(false);
      setIsTagDropdownOpen(false);
      setNewTagName('');
      setIsCreatingTag(false);
      setTagSearchQuery('');
      setDraftReply('');
      setShowToneDropdown(false);
    }
  }, [contact?.id]);

  // Fetch all tags only if not provided via props
  useEffect(() => {
    if (propAllTags) return; // Skip fetching if provided via props

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

  // Close dropdown when clicking outside - use capture phase to handle early
  useEffect(() => {
    if (!isTagDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInDropdown = tagDropdownRef.current?.contains(target);
      const isInButton = tagButtonRef.current?.contains(target);
      if (!isInDropdown && !isInButton) {
        setIsTagDropdownOpen(false);
        setIsCreatingTag(false);
        setNewTagName('');
        setTagSearchQuery('');
      }
    };

    // Add listener after a small delay to avoid catching the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTagDropdownOpen]);

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isTagDropdownOpen && tagButtonRef.current) {
      const rect = tagButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isTagDropdownOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isTagDropdownOpen && !isCreatingTag) {
      setTimeout(() => tagSearchInputRef.current?.focus(), 10);
    }
  }, [isTagDropdownOpen, isCreatingTag]);

  // Filter tags by search query
  const filteredTags = allTags.filter(tag => {
    if (!tagSearchQuery.trim()) return true;
    return tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase());
  });

  // Close tone dropdown when clicking outside
  useEffect(() => {
    if (!showToneDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toneDropdownRef.current && !toneDropdownRef.current.contains(e.target as Node)) {
        setShowToneDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showToneDropdown]);

  // Generate draft reply
  const generateDraftReply = useCallback(async () => {
    if (!contact || isGeneratingDraft) return;
    setIsGeneratingDraft(true);
    setDraftReply('');

    try {
      const response = await fetch(`/api/inbox-zero/draft/${contact.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: selectedTone }),
      });
      const data = await response.json();
      if (data.success && data.draft) {
        setDraftReply(data.draft);
      }
    } catch (error) {
      console.error('Failed to generate draft:', error);
    } finally {
      setIsGeneratingDraft(false);
    }
  }, [contact, selectedTone, isGeneratingDraft]);

  // Copy draft to clipboard
  const copyDraftToClipboard = useCallback(async () => {
    if (!draftReply) return;
    try {
      await navigator.clipboard.writeText(draftReply);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [draftReply]);

  // Add tag to contact - delegates to parent callback which handles API and state
  const addTagToContact = (tag: Tag) => {
    if (!contact || !onTagsChange) return;
    if (contactTags.some(t => t.id === tag.id)) return; // Already has tag

    const newTags = [...contactTags, { id: tag.id, name: tag.name, color: tag.color }];
    onTagsChange(contact.id, newTags);
  };

  // Remove tag from contact - delegates to parent callback which handles API and state
  const removeTagFromContact = (tagId: string) => {
    if (!contact || !onTagsChange) return;

    const newTags = contactTags.filter(t => t.id !== tagId);
    onTagsChange(contact.id, newTags);
  };

  // Create new tag
  const createAndAddTag = async () => {
    if (!contact || !newTagName.trim() || !onTagsChange) return;

    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const data = await response.json();

      if (data.success && data.data) {
        const newTag = data.data;
        // Update local tags list if not using prop-provided tags
        if (!propAllTags) {
          setLocalAllTags(prev => [...prev, newTag]);
        }
        // Add the new tag to the contact via parent callback
        const newTags = [...contactTags, { id: newTag.id, name: newTag.name, color: newTag.color }];
        onTagsChange(contact.id, newTags);
        setNewTagName('');
        setIsCreatingTag(false);
      }
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  // Export members to CSV
  const exportMembers = async () => {
    if (!contact || isExporting) return;

    setIsExporting(true);
    try {
      const response = await fetch(`/api/conversations/${contact.id}/members/export`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${contact.name.replace(/[^a-z0-9]/gi, '_')}_members.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export members:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!contact) return null;

  const isGroup = contact.type === 'group' || contact.type === 'supergroup';
  const isChannel = contact.type === 'channel';
  const isPerson = contact.type === 'private';
  const hasAvatar = contact.avatarUrl && !imageError;
  const avatarColorScheme = getAvatarColor(contact.id);
  const availableTagsToAdd = allTags.filter(t => !contactTags.some(ct => ct.id === t.id));

  // Fix: Online status should be consistent - if online, show "Online", not relative time
  const getStatusText = () => {
    if (isPerson && contact.isOnline) {
      return 'Online';
    }
    return `Last seen ${formatRelativeTime(contact.lastInteraction)}`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobile ? '100vw' : '380px',
          maxWidth: '100vw',
          background: 'var(--bg-primary)',
          borderLeft: isMobile ? 'none' : '1px solid var(--border-subtle)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: isMobile ? 'none' : 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isOpen && !isMobile ? '-8px 0 32px rgba(0, 0, 0, 0.15)' : 'none',
        }}
      >
        {/* Header - Linear style minimal, with back button on mobile */}
        <div className={isMobile ? 'safe-area-top' : ''} style={{
          padding: isMobile ? '16px' : '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
          gap: '12px',
        }}>
          {isMobile ? (
            <>
              <button
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--accent-primary)',
                  fontSize: '14px',
                  fontWeight: 500,
                  padding: '8px 0',
                }}
              >
                <BackIcon />
                Back
              </button>
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                Contact Details
              </span>
              <div style={{ width: '60px' }} /> {/* Spacer for centering */}
            </>
          ) : (
            <>
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Contact Details
              </span>
              <button
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                }}
              >
                <CloseIcon />
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Profile Section - Left aligned, Linear style */}
          <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              {/* Avatar */}
              <div style={{ flexShrink: 0 }}>
                {hasAvatar ? (
                  <img
                    src={contact.avatarUrl!.startsWith('/media/')
                      ? `/api${contact.avatarUrl}`
                      : contact.avatarUrl!}
                    alt={contact.name}
                    onError={() => setImageError(true)}
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '12px',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '12px',
                    background: avatarColorScheme.bg,
                    color: avatarColorScheme.text,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '18px',
                  }}>
                    {isGroup ? (
                      <GroupIcon style={{ width: '24px', height: '24px' }} />
                    ) : isChannel ? (
                      <ChannelIcon style={{ width: '24px', height: '24px' }} />
                    ) : (
                      contact.initials
                    )}
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: '0 0 2px 0',
                  letterSpacing: '-0.01em',
                }}>
                  {contact.name}
                </h2>
                <p style={{
                  fontSize: '12px',
                  color: 'var(--text-tertiary)',
                  margin: '0 0 4px 0',
                }}>
                  {contact.username ? `@${contact.username}` : (
                    isChannel ? 'Channel' : isGroup ? 'Group' : 'Private Chat'
                  )}
                </p>

                {/* Last message time */}
                <p style={{
                  fontSize: '11px',
                  color: 'var(--text-quaternary)',
                  margin: '0 0 8px 0',
                }}>
                  Last message {formatRelativeTime(contact.lastInteraction)}
                </p>

                {/* Online status - only for people, fixed consistency */}
                {isPerson && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 8px',
                    background: contact.isOnline ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-tertiary)',
                    borderRadius: '4px',
                  }}>
                    {contact.isOnline && (
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#22C55E',
                      }} />
                    )}
                    <span style={{
                      fontSize: '11px',
                      color: contact.isOnline ? '#22C55E' : 'var(--text-tertiary)',
                      fontWeight: 500,
                    }}>
                      {getStatusText()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => onOpenChat(contact.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'white',
                  background: 'var(--accent-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--accent-primary)';
                }}
              >
                <ChatIcon />
                Open Conversation
              </button>

              {/* Export Members Button - only for groups/channels with members */}
              {(isGroup || isChannel) && (contact.hasMemberData || contact.memberCount) && (
                <Tooltip content="Export group members to CSV" position="bottom">
                <button
                  onClick={exportMembers}
                  disabled={isExporting}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    transition: 'all 150ms ease',
                    opacity: isExporting ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isExporting) {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                  }}
                >
                  <DownloadIcon size={14} />
                </button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Stats Row - Compact Linear style */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <StatItem label="Messages" value={contact.totalMessages.toLocaleString()} />
            <StatItem label="First contact" value={formatDate(contact.firstContactDate)} />
            {(isGroup || isChannel) && contact.memberCount && (
              <StatItem label="Members" value={contact.memberCount.toLocaleString()} />
            )}
          </div>

          {/* Tags Section - Linear style inline assignment (matches ContactsTable) */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid var(--border-subtle)',
            position: 'relative',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '10px',
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Labels
              </span>
            </div>

            {/* Tags display with inline + button - Linear style */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              {contactTags.map((tag) => (
                <span
                  key={tag.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 8px',
                    fontSize: '12px',
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
                    onClick={() => removeTagFromContact(tag.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '14px',
                      height: '14px',
                      padding: 0,
                      background: 'none',
                      border: 'none',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      color: 'inherit',
                      opacity: 0.5,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                  >
                    <CloseIcon size={10} />
                  </button>
                </span>
              ))}

              {/* Inline + button for adding tags - Linear style */}
              <div style={{ position: 'relative' }}>
                <Tooltip content="Add label" position="top" disabled={isTagDropdownOpen}>
                <button
                  ref={tagButtonRef}
                  onClick={(e) => {
                    // Prevent any bubbling
                    e.stopPropagation();

                    // Calculate position synchronously BEFORE toggling open state
                    if (!isTagDropdownOpen && tagButtonRef.current) {
                      const rect = tagButtonRef.current.getBoundingClientRect();
                      setDropdownPosition({
                        top: rect.bottom + 4,
                        left: rect.left,
                      });
                    }
                    setIsTagDropdownOpen(!isTagDropdownOpen);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    padding: 0,
                    background: 'transparent',
                    border: '1px dashed var(--border-default)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: 'var(--text-quaternary)',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.borderStyle = 'solid';
                    e.currentTarget.style.color = 'var(--text-tertiary)';
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isTagDropdownOpen) {
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                      e.currentTarget.style.borderStyle = 'dashed';
                      e.currentTarget.style.color = 'var(--text-quaternary)';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <PlusIcon size={12} />
                </button>
                </Tooltip>

                {/* Tag Dropdown - Rendered via Portal to escape panel hierarchy */}
                {isTagDropdownOpen && typeof document !== 'undefined' && createPortal(
                  <div
                    ref={tagDropdownRef}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed',
                      top: dropdownPosition.top,
                      left: dropdownPosition.left,
                      width: '220px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                      zIndex: 9999,
                    }}>
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
                            filteredTags.map(tag => {
                              const isSelected = contactTags.some(ct => ct.id === tag.id);
                              return (
                                <button
                                  key={tag.id}
                                  onClick={() => {
                                    if (isSelected) {
                                      removeTagFromContact(tag.id);
                                    } else {
                                      addTagToContact(tag);
                                    }
                                  }}
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
                                  {/* Checkbox */}
                                  <span style={{
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '3px',
                                    border: isSelected ? 'none' : '1px solid var(--border-default)',
                                    background: isSelected ? 'var(--accent-primary)' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}>
                                    {isSelected && <CheckIcon size={10} color="white" />}
                                  </span>
                                  {/* Color dot */}
                                  <span style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: tag.color || 'var(--text-quaternary)',
                                    flexShrink: 0,
                                  }} />
                                  {/* Name */}
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
                            onClick={() => setIsCreatingTag(true)}
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
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') createAndAddTag();
                            if (e.key === 'Escape') {
                              setIsCreatingTag(false);
                              setNewTagName('');
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
                              onClick={() => setNewTagColor(color)}
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
                            onClick={() => {
                              setIsCreatingTag(false);
                              setNewTagName('');
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
                            onClick={createAndAddTag}
                            disabled={!newTagName.trim()}
                            style={{
                              flex: 1,
                              padding: '8px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: 'white',
                              background: newTagName.trim() ? 'var(--accent-primary)' : 'var(--text-quaternary)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: newTagName.trim() ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Create
                          </button>
                        </div>
                      </div>
                    )}
                  </div>,
                  document.body
                )}
              </div>
            </div>
          </div>

          {/* Contact Info */}
          {(contact.phone || contact.email) && (
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '10px',
              }}>
                Contact Info
              </span>
              {contact.phone && (
                <InfoRow icon={<PhoneIcon />} label="Phone" value={contact.phone} />
              )}
              {contact.email && (
                <InfoRow icon={<EmailIcon />} label="Email" value={contact.email} />
              )}
            </div>
          )}

          {/* Draft Reply Section */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Draft Reply
              </span>
              {/* Tone selector */}
              <div style={{ position: 'relative' }} ref={toneDropdownRef}>
                <button
                  onClick={() => setShowToneDropdown(!showToneDropdown)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {selectedTone.charAt(0).toUpperCase() + selectedTone.slice(1)}
                  <ChevronDownIcon size={10} />
                </button>
                {showToneDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    minWidth: '120px',
                  }}>
                    {(['professional', 'friendly', 'casual'] as const).map(tone => (
                      <button
                        key={tone}
                        onClick={() => {
                          setSelectedTone(tone);
                          setShowToneDropdown(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '8px 12px',
                          fontSize: '12px',
                          color: selectedTone === tone ? 'var(--accent-primary)' : 'var(--text-primary)',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {tone.charAt(0).toUpperCase() + tone.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Generate button or draft content */}
            {!draftReply && !isGeneratingDraft ? (
              <button
                onClick={generateDraftReply}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--accent-primary)',
                  background: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-primary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-primary)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--accent-subtle)';
                  e.currentTarget.style.color = 'var(--accent-primary)';
                }}
              >
                <SparkleIcon size={14} />
                Generate Draft in Shalin's Tone
              </button>
            ) : isGeneratingDraft ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '20px',
                color: 'var(--text-tertiary)',
                fontSize: '13px',
              }}>
                <LoadingSpinner size={14} />
                Generating draft...
              </div>
            ) : (
              <div>
                <div style={{
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  marginBottom: '8px',
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: '13px',
                    lineHeight: 1.5,
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {draftReply}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={copyDraftToClipboard}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <CopyIcon size={12} />
                    Copy
                  </button>
                  <button
                    onClick={generateDraftReply}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--accent-primary)',
                      background: 'transparent',
                      border: '1px solid var(--accent-primary)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshIcon size={12} />
                    Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Notes Timeline */}
          <NotesTimeline
            conversationId={contact.id}
            isExpanded={true}
            fullHeight={false}
          />
        </div>
      </div>
    </>
  );
}

// ============================================
// Sub-components
// ============================================

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: 1,
      padding: '12px 16px',
      borderRight: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 500,
        color: 'var(--text-quaternary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '2px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 0',
    }}>
      <div style={{ color: 'var(--text-quaternary)' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '10px', color: 'var(--text-quaternary)', marginBottom: '1px' }}>{label}</div>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M11 3L3 11M3 3l8 8" />
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

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10c0 .55-.45 1-1 1H4l-3 3V3c0-.55.45-1 1-1h11c.55 0 1 .45 1 1v7z" />
    </svg>
  );
}

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M7 2v10M2 7h10" />
    </svg>
  );
}

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" />
      <path d="M8 10V2" />
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 11.5v2a1.33 1.33 0 01-1.45 1.33 13.17 13.17 0 01-5.74-2.04 12.97 12.97 0 01-4-4 13.17 13.17 0 01-2.04-5.76A1.33 1.33 0 012.6 1.5h2a1.33 1.33 0 011.33 1.15c.08.63.24 1.25.45 1.84a1.33 1.33 0 01-.3 1.4l-.85.85a10.67 10.67 0 004 4l.85-.85a1.33 1.33 0 011.4-.3c.59.21 1.21.37 1.84.45a1.33 1.33 0 011.18 1.36z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.67 2.67h10.66c.74 0 1.34.6 1.34 1.33v8c0 .73-.6 1.33-1.34 1.33H2.67c-.74 0-1.34-.6-1.34-1.33V4c0-.73.6-1.33 1.34-1.33z" />
      <path d="M14.67 4L8 8.67 1.33 4" />
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
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 12L6 8l4-4" />
    </svg>
  );
}

function ChevronDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.25L7 8.75L10.5 5.25" />
    </svg>
  );
}

function SparkleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0L9.5 5.5L15 7L9.5 8.5L8 14L6.5 8.5L1 7L6.5 5.5L8 0Z" />
    </svg>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M2 11V3a1 1 0 011-1h8" />
    </svg>
  );
}

function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2v4h-4" />
      <path d="M2 14v-4h4" />
      <path d="M13.5 6A6 6 0 003 4.5L2 6" />
      <path d="M2.5 10A6 6 0 0013 11.5l1-1.5" />
    </svg>
  );
}

function LoadingSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle cx="8" cy="8" r="6" stroke="var(--border-default)" strokeWidth="2" />
      <path d="M14 8a6 6 0 00-6-6" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
