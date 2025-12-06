'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ConversationsList from './components/ConversationsList';
import ContactsTable, { Contact } from './components/ContactsTable';
import ContactSlidePanel from './components/ContactSlidePanel';
import MessageView from './components/MessageView';
import AIAssistant from './components/AIAssistant';
import SearchModal from './components/SearchModal';
import { Conversation, Message, MessagesResponse } from './types';
import { useSync, ConversationSyncResult, GlobalSyncResult } from './contexts/SyncContext';
import { useRealtimeUpdates } from './hooks/useRealtimeUpdates';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
  category?: string | null;
  conversationCount: number;
}

type ViewMode = 'messages' | 'contacts';

// Mobile panel states for responsive navigation
type MobilePanel = 'conversations' | 'messages' | 'assistant';

// Custom hook for responsive breakpoints
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return matches;
}

export default function Home() {
  // View mode: messages or contacts
  const [viewMode, setViewMode] = useState<ViewMode>('messages');

  // Mobile-specific state
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('conversations');
  const isMobile = useMediaQuery('(max-width: 639px)');
  const isTablet = useMediaQuery('(min-width: 640px) and (max-width: 1023px)');

  // All conversations (unfiltered) - single source of truth
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactTypeFilter, setContactTypeFilter] = useState<'all' | 'people' | 'groups' | 'channels'>('all');
  const [contactCounts, setContactCounts] = useState({ all: 0, people: 0, groups: 0, channels: 0 });
  const [contactsLoading, setContactsLoading] = useState(false);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);

  // All tags with their counts
  const [allTags, setAllTags] = useState<Tag[]>([]);

  // Panel widths
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Message to highlight/scroll to from search
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);

  // Sync context for real-time updates
  const { onSyncComplete } = useSync();

  // Special filter ID for untagged conversations
  const UNTAGGED_FILTER_ID = '__untagged__';

  // Client-side filtered conversations - instant filtering
  const filteredConversations = useMemo(() => {
    // Safety check: ensure allConversations is an array
    const conversations = Array.isArray(allConversations) ? allConversations : [];

    if (selectedTagIds.length === 0) {
      return conversations;
    }

    const hasUntaggedFilter = selectedTagIds.includes(UNTAGGED_FILTER_ID);
    const regularTagIds = selectedTagIds.filter(id => id !== UNTAGGED_FILTER_ID);

    return conversations.filter(conv => {
      // Check if conversation matches "untagged" filter
      const isUntagged = !conv.tags || conv.tags.length === 0;
      if (hasUntaggedFilter && isUntagged) {
        return true;
      }

      // Check if conversation matches any of the regular tag filters
      if (regularTagIds.length > 0 && conv.tags?.some(tag => regularTagIds.includes(tag.id))) {
        return true;
      }

      // If only untagged filter is active and this conv has tags, exclude it
      if (hasUntaggedFilter && regularTagIds.length === 0) {
        return isUntagged;
      }

      return false;
    });
  }, [allConversations, selectedTagIds]);

  // Compute tag counts from conversations - always up to date
  // Also includes a special "Untagged" option
  const tagsWithCounts = useMemo(() => {
    const countMap = new Map<string, number>();
    let untaggedCount = 0;

    // Safety check: ensure allConversations is an array
    const conversations = Array.isArray(allConversations) ? allConversations : [];

    // Count conversations for each tag and untagged
    conversations.forEach(conv => {
      if (!conv.tags || conv.tags.length === 0) {
        untaggedCount++;
      } else {
        conv.tags.forEach(tag => {
          countMap.set(tag.id, (countMap.get(tag.id) || 0) + 1);
        });
      }
    });

    // Create "Untagged" option first, then merge with allTags
    const untaggedOption: Tag = {
      id: UNTAGGED_FILTER_ID,
      name: 'Untagged',
      color: null,
      conversationCount: untaggedCount,
    };

    const regularTags = allTags.map(tag => ({
      ...tag,
      conversationCount: countMap.get(tag.id) || 0,
    }));

    return [untaggedOption, ...regularTags];
  }, [allTags, allConversations, UNTAGGED_FILTER_ID]);

  // Fetch all conversations - separate initial load vs refresh
  const fetchConversations = useCallback(async (isInitialLoad = false) => {
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();
      // Ensure we only set an array (API might return error object on failure)
      if (Array.isArray(data)) {
        setAllConversations(data);
      } else {
        console.error('Conversations API returned non-array:', data);
        // Keep existing data on error, or set empty array on initial load
        if (isInitialLoad) {
          setAllConversations([]);
        }
      }

      // Select the first conversation with messages by default (only on initial load)
      if (isInitialLoad && Array.isArray(data) && data.length > 0) {
        const firstWithMessages = data.find((c: Conversation) => c.totalMessages > 0);
        if (firstWithMessages) {
          setSelectedConversation(firstWithMessages);
        } else {
          setSelectedConversation(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch contacts for Contacts view
  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const response = await fetch('/api/contacts');
      const data = await response.json();
      if (data.contacts) {
        setContacts(data.contacts);
        setContactCounts(data.counts);
        // Select first contact if none selected
        if (!selectedContact && data.contacts.length > 0) {
          setSelectedContact(data.contacts[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setContactsLoading(false);
    }
  }, [selectedContact]);

  // Filter contacts by type
  const filteredContacts = useMemo(() => {
    if (contactTypeFilter === 'all') return contacts;
    if (contactTypeFilter === 'people') return contacts.filter(c => c.type === 'private');
    if (contactTypeFilter === 'groups') return contacts.filter(c => c.type === 'group' || c.type === 'supergroup');
    if (contactTypeFilter === 'channels') return contacts.filter(c => c.type === 'channel');
    return contacts;
  }, [contacts, contactTypeFilter]);

  // Fetch all tags (once)
  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      if (data.success) {
        setAllTags(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchConversations(true); // Initial load - select first conversation
    fetchTags();
  }, [fetchConversations, fetchTags]);

  // Fetch contacts when switching to contacts view
  useEffect(() => {
    if (viewMode === 'contacts' && contacts.length === 0) {
      fetchContacts();
    }
  }, [viewMode, contacts.length, fetchContacts]);

  const handleTagFilterChange = (tagIds: string[]) => {
    setSelectedTagIds(tagIds);
  };

  // Global keyboard shortcut for search (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle search result selection - navigate to conversation and scroll to message
  const handleSearchSelectConversation = useCallback(
    (conversationId: string, messageId?: string) => {
      // Switch to messages view if not already
      setViewMode('messages');

      // Set the message to highlight/scroll to
      if (messageId) {
        setHighlightMessageId(messageId);
        // Clear highlight after 3 seconds
        setTimeout(() => setHighlightMessageId(null), 3000);
      }

      // Find the conversation in the list
      const conversation = allConversations.find((c) => c.id === conversationId);
      if (conversation) {
        setSelectedConversation(conversation);
      } else {
        // Fetch fresh if not in current list (might be filtered out by tags)
        fetch(`/api/conversations/${conversationId}`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.id) {
              setSelectedConversation(data);
              // Also add to conversations list if not present
              setAllConversations((prev) => {
                if (!prev.find((c) => c.id === data.id)) {
                  return [data, ...prev];
                }
                return prev;
              });
            }
          })
          .catch(console.error);
      }
    },
    [allConversations]
  );

  // Fetch messages - showLoading=false for sync refreshes to avoid unmounting MessageView
  const fetchMessages = useCallback(async (conversationId: string, showLoading = true) => {
    if (showLoading) {
      setMessagesLoading(true);
    }
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      const data: MessagesResponse = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setMessages([]);
    } finally {
      if (showLoading) {
        setMessagesLoading(false);
      }
    }
  }, []);

  // Real-time listener updates - auto-refresh when new messages arrive
  const handleNewMessages = useCallback(() => {
    console.log('[Home] Real-time: New messages detected, refreshing data');
    fetchConversations(false);
    if (selectedConversation) {
      fetchMessages(selectedConversation.id, false);
    }
  }, [fetchConversations, fetchMessages, selectedConversation]);

  // Monitor real-time listener for new messages (polls every 2 seconds when listener is active)
  const { isListenerActive } = useRealtimeUpdates({
    pollingInterval: 2000,
    onNewMessages: handleNewMessages,
  });

  // Listen for sync completion to refresh data in real-time
  useEffect(() => {
    const unsubscribe = onSyncComplete((type, result) => {
      // Always refresh conversation list after any sync
      fetchConversations(false);

      // For single sync, also refresh messages if it's the currently selected conversation
      // Pass showLoading=false to avoid unmounting MessageView (which would hide the sync result)
      if (type === 'single') {
        const singleResult = result as ConversationSyncResult;
        if (
          singleResult.conversationId &&
          selectedConversation?.id === singleResult.conversationId &&
          singleResult.messagesSynced > 0
        ) {
          fetchMessages(singleResult.conversationId, false);
        }
      }

      // For global sync, refresh the current conversation's messages if any were synced
      if (type === 'global' && selectedConversation) {
        const globalResult = result as GlobalSyncResult;
        if (globalResult.messagesSynced > 0) {
          fetchMessages(selectedConversation.id, false);
        }
      }
    });

    return () => unsubscribe();
  }, [onSyncComplete, fetchConversations, fetchMessages, selectedConversation]);

  // Track the conversation ID separately to avoid refetching on tag changes
  const selectedConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedConversation && selectedConversation.id !== selectedConversationIdRef.current) {
      selectedConversationIdRef.current = selectedConversation.id;
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation, fetchMessages]);

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    // On mobile, navigate to messages view when selecting a conversation
    if (isMobile) {
      setMobilePanel('messages');
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsContactPanelOpen(true);
  };

  const handleCloseContactPanel = () => {
    setIsContactPanelOpen(false);
  };

  // Handle "Open Chat" from contact detail - switch to messages view
  const handleOpenChat = useCallback((contactId: string) => {
    setViewMode('messages');
    // Find the corresponding conversation
    const conversation = allConversations.find(c => c.id === contactId);
    if (conversation) {
      setSelectedConversation(conversation);
    }
  }, [allConversations]);

  // Handle contact tag changes (inline assignment in contacts table)
  const handleContactTagsChange = useCallback(async (
    contactId: string,
    tags: { id: string; name: string; color: string | null }[]
  ) => {
    // Optimistically update the local state
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? { ...c, tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })) }
          : c
      )
    );

    // Also update selected contact if it's the one being modified
    if (selectedContact?.id === contactId) {
      setSelectedContact((prev) =>
        prev ? { ...prev, tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })) } : null
      );
    }

    // Persist to the server
    try {
      await fetch(`/api/conversations/${contactId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: tags.map(t => t.id) }),
      });
    } catch (error) {
      console.error('Failed to update contact tags:', error);
      // Could revert optimistic update here if needed
    }
  }, [selectedContact]);

  // Handle bulk tag changes for multiple contacts at once
  const handleBulkContactTagsChange = useCallback((
    contactIds: string[],
    tags: { id: string; name: string; color: string | null }[]
  ) => {
    // Update all selected contacts with the new tags
    contactIds.forEach(contactId => {
      handleContactTagsChange(contactId, tags);
    });
  }, [handleContactTagsChange]);

  // Handle export contacts to CSV
  const handleExportContactsCsv = useCallback(() => {
    const headers = ['Name', 'Type', 'Username', 'Phone', 'Email', 'Messages', 'First Contact', 'Last Interaction', 'Tags', 'Notes'];
    const rows = filteredContacts.map(c => [
      c.name,
      c.type,
      c.username || '',
      c.phone || '',
      c.email || '',
      c.totalMessages.toString(),
      new Date(c.firstContactDate).toLocaleDateString(),
      new Date(c.lastInteraction).toLocaleDateString(),
      c.tags.map(t => t.name).join('; '),
      (c.notes || '').replace(/\n/g, ' '),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredContacts]);

  const handleSendMessage = (text: string) => {
    // Add optimistic message
    const newMessage: Message = {
      id: `temp-${Date.now()}`,
      text,
      sent: true,
      time: new Date().toISOString(),
      deliveredAt: null,
      readAt: null,
      status: 'sending',
      contentType: 'text',
    };
    setMessages((prev) => [...prev, newMessage]);

    // Update conversation last message
    if (selectedConversation) {
      setAllConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversation.id
            ? { ...c, lastMessage: text, lastMessageDirection: 'outbound' as const, time: new Date().toISOString() }
            : c
        )
      );
    }

    // Simulate message sent status update
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === newMessage.id ? { ...m, status: 'sent' } : m
        )
      );
    }, 500);
  };

  // Handle tag changes from the message header - immediately update conversation list
  const handleTagsChange = (conversationId: string, tags: { id: string; name: string; color: string | null }[]) => {
    // Update the conversation's tags in allConversations
    setAllConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })) }
          : c
      )
    );

    // Also update the selected conversation if it's the one being modified
    if (selectedConversation?.id === conversationId) {
      setSelectedConversation((prev) =>
        prev ? { ...prev, tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })) } : null
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center" style={{ gap: 'var(--space-4)' }}>
          <div
            className="animate-spin"
            style={{
              width: '32px',
              height: '32px',
              border: '2px solid var(--accent-primary)',
              borderTopColor: 'transparent',
              borderRadius: 'var(--radius-full)',
            }}
          />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Contacts view: full-width table with slide-out panel
  if (viewMode === 'contacts') {
    return (
      <div className="flex flex-col h-screen" style={{ background: 'var(--bg-primary)' }}>
        {/* Top Bar with View Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
        }}>
          {/* View Toggle - Linear-style segmented control with fixed width */}
          <div style={{
            display: 'flex',
            gap: '1px',
            padding: '2px',
            background: 'var(--bg-tertiary)',
            borderRadius: '6px',
            width: '180px',
          }}>
            <button
              onClick={() => setViewMode('messages')}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              Messages
            </button>
            <button
              onClick={() => setViewMode('contacts')}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                background: 'var(--bg-primary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
              Contacts
            </button>
          </div>
        </div>

        {/* Full-width Contacts Table */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ContactsTable
            contacts={filteredContacts}
            onSelect={handleSelectContact}
            typeFilter={contactTypeFilter}
            onTypeFilterChange={setContactTypeFilter}
            counts={contactCounts}
            onExportCsv={handleExportContactsCsv}
            allTags={allTags}
            onTagsChange={handleContactTagsChange}
            onBulkTagsChange={handleBulkContactTagsChange}
            isLoading={contactsLoading}
          />
        </div>

        {/* Slide-out Contact Panel */}
        <ContactSlidePanel
          contact={selectedContact}
          isOpen={isContactPanelOpen}
          onClose={handleCloseContactPanel}
          onOpenChat={handleOpenChat}
          onTagsChange={handleContactTagsChange}
          allTags={allTags}
        />
      </div>
    );
  }

  // Messages view: responsive layout (3-column desktop, single panel mobile)
  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <div
          className="safe-area-bottom"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-around',
            padding: '8px 0',
          }}
        >
          <MobileNavButton
            label="Chats"
            icon={<ChatListIcon />}
            active={mobilePanel === 'conversations'}
            onClick={() => setMobilePanel('conversations')}
          />
          <MobileNavButton
            label="Messages"
            icon={<MessageIcon />}
            active={mobilePanel === 'messages'}
            onClick={() => setMobilePanel('messages')}
            disabled={!selectedConversation}
          />
          <MobileNavButton
            label="AI"
            icon={<AIIcon />}
            active={mobilePanel === 'assistant'}
            onClick={() => setMobilePanel('assistant')}
            disabled={!selectedConversation}
          />
          <MobileNavButton
            label="Contacts"
            icon={<ContactsIcon />}
            active={false}
            onClick={() => setViewMode('contacts')}
          />
        </div>
      )}

      {/* Left Panel - Conversations List (hidden on mobile when not active) */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{
          width: isMobile ? '100%' : `${leftPanelWidth}px`,
          minWidth: isMobile ? undefined : '280px',
          maxWidth: isMobile ? undefined : '400px',
          borderRight: isMobile ? 'none' : '1px solid var(--border-subtle)',
          display: isMobile && mobilePanel !== 'conversations' ? 'none' : 'flex',
          paddingBottom: isMobile ? '60px' : 0, // Space for mobile nav
        }}
      >
        {/* View Toggle - Hidden on mobile (use bottom nav instead) */}
        {!isMobile && (
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{
              display: 'flex',
              gap: '1px',
              padding: '2px',
              background: 'var(--bg-tertiary)',
              borderRadius: '6px',
              width: '180px',
            }}>
              <button
                onClick={() => setViewMode('messages')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                Messages
              </button>
              <button
                onClick={() => setViewMode('contacts')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                Contacts
              </button>
            </div>
          </div>
        )}

        {/* Conversations List */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ConversationsList
            conversations={filteredConversations}
            allTags={tagsWithCounts}
            selectedId={selectedConversation?.id || null}
            onSelect={handleSelectConversation}
            selectedTagIds={selectedTagIds}
            onTagFilterChange={handleTagFilterChange}
            onOpenSearch={() => setIsSearchOpen(true)}
          />
        </div>
      </div>

      {/* Left Resizer - Hidden on mobile */}
      {!isMobile && (
        <Resizer
          onResize={(delta) => {
            setLeftPanelWidth((prev) => Math.min(400, Math.max(280, prev + delta)));
          }}
        />
      )}

      {/* Middle Panel - Messages (full width on mobile) */}
      <div
        className="flex-1"
        style={{
          minWidth: isMobile ? undefined : '400px',
          display: isMobile && mobilePanel !== 'messages' ? 'none' : 'flex',
          flexDirection: 'column',
          paddingBottom: isMobile ? '60px' : 0,
        }}
      >
        {/* Mobile back button */}
        {isMobile && selectedConversation && (
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <button
              onClick={() => setMobilePanel('conversations')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
              }}
            >
              <BackIcon />
            </button>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {selectedConversation.name}
            </span>
          </div>
        )}
        {messagesLoading ? (
          <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)', flex: 1 }}>
            <div className="flex-1 flex items-center justify-center">
              <div
                className="animate-spin"
                style={{
                  width: '24px',
                  height: '24px',
                  border: '2px solid var(--accent-primary)',
                  borderTopColor: 'transparent',
                  borderRadius: 'var(--radius-full)',
                }}
              />
            </div>
          </div>
        ) : (
          <MessageView
            conversation={selectedConversation}
            messages={messages}
            onSendMessage={handleSendMessage}
            onTagsChange={handleTagsChange}
            highlightMessageId={highlightMessageId}
          />
        )}
      </div>

      {/* Right Resizer - Hidden on mobile/tablet */}
      {!isMobile && !isTablet && (
        <Resizer
          onResize={(delta) => {
            setRightPanelWidth((prev) => Math.min(480, Math.max(300, prev - delta)));
          }}
        />
      )}

      {/* Right Panel - AI Assistant (full screen on mobile, hidden on tablet) */}
      <div
        className="flex-shrink-0"
        style={{
          width: isMobile ? '100%' : `${rightPanelWidth}px`,
          minWidth: isMobile ? undefined : '300px',
          maxWidth: isMobile ? undefined : '480px',
          borderLeft: isMobile ? 'none' : '1px solid var(--border-subtle)',
          display: isMobile
            ? (mobilePanel === 'assistant' ? 'block' : 'none')
            : (isTablet ? 'none' : 'block'),
          paddingBottom: isMobile ? '60px' : 0,
        }}
      >
        {/* Mobile back button for AI */}
        {isMobile && (
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <button
              onClick={() => setMobilePanel('messages')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
              }}
            >
              <BackIcon />
            </button>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              AI Assistant
            </span>
          </div>
        )}
        <AIAssistant conversation={selectedConversation} />
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectConversation={handleSearchSelectConversation}
      />
    </div>
  );
}

interface ResizerProps {
  onResize: (delta: number) => void;
}

function Resizer({ onResize }: ResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      startXRef.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: '4px',
        cursor: 'col-resize',
        background: isDragging ? 'var(--accent-primary)' : 'transparent',
        transition: isDragging ? 'none' : 'background 150ms ease',
        position: 'relative',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.background = 'var(--accent-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {/* Extended hit area */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '-4px',
        right: '-4px',
        bottom: 0,
      }} />
    </div>
  );
}

// Mobile navigation button component
interface MobileNavButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function MobileNavButton({ label, icon, active, onClick, disabled }: MobileNavButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-btn"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        padding: '4px 16px',
        background: 'transparent',
        border: 'none',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        minHeight: 'auto',
        minWidth: 'auto',
      }}
    >
      <span style={{
        color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: '10px',
        fontWeight: 500,
        color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)',
      }}>
        {label}
      </span>
    </button>
  );
}

// Mobile navigation icons
function ChatListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function AIIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function ContactsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
