'use client';

import { useState, useRef, useEffect } from 'react';
import { Conversation } from '../types';
import NotesTimeline from './NotesTimeline';
import { track } from '@/app/lib/analytics/client';

interface AIAssistantProps {
  conversation: Conversation | null;
}

// Tab types
type TabType = 'ai' | 'notes';

// Intelligent suggestion prompts based on conversation context
interface SuggestionPrompt {
  text: string;
  icon?: 'summary' | 'action' | 'insight' | 'prepare';
}

// Generate contextual suggestions based on tags and conversation state
function getContextualSuggestions(conversation: Conversation | null): SuggestionPrompt[] {
  if (!conversation) {
    return [
      { text: 'Summarize this conversation', icon: 'summary' },
      { text: 'What topics did we discuss?', icon: 'insight' },
      { text: 'Any action items I should follow up on?', icon: 'action' },
    ];
  }

  const tags = conversation.tags || [];
  const tagNames = tags.map(t => t.name.toLowerCase());
  const isGroup = conversation.type === 'group' || conversation.type === 'supergroup';
  const messageCount = conversation.totalMessages || 0;

  // Check how recent the last message was
  const lastMessageTime = conversation.time ? new Date(conversation.time) : null;
  const hoursSinceLastMessage = lastMessageTime
    ? (Date.now() - lastMessageTime.getTime()) / (1000 * 60 * 60)
    : Infinity;
  const isRecent = hoursSinceLastMessage < 24;
  const isDormant = hoursSinceLastMessage > 72;

  const suggestions: SuggestionPrompt[] = [];

  // TAG-BASED SUGGESTIONS (highest priority - most specific)

  // Hot Lead - sales-focused
  if (tagNames.includes('hot lead')) {
    suggestions.push(
      { text: 'What are their key pain points and buying signals?', icon: 'insight' },
      { text: 'Draft a follow-up message to move the deal forward', icon: 'action' },
      { text: 'What objections might they have?', icon: 'prepare' }
    );
    return suggestions.slice(0, 3);
  }

  // Customer - service-focused
  if (tagNames.includes('customer')) {
    suggestions.push(
      { text: 'Summarize our relationship and recent interactions', icon: 'summary' },
      { text: 'Any support issues or concerns raised?', icon: 'insight' },
      { text: 'What upsell or cross-sell opportunities exist?', icon: 'action' }
    );
    return suggestions.slice(0, 3);
  }

  // Prospect - qualification-focused
  if (tagNames.includes('prospect')) {
    suggestions.push(
      { text: 'Are they qualified? What\'s their budget and timeline?', icon: 'insight' },
      { text: 'What are the next steps to convert them?', icon: 'action' },
      { text: 'Summarize their requirements and interests', icon: 'summary' }
    );
    return suggestions.slice(0, 3);
  }

  // Follow-up - action-focused
  if (tagNames.includes('follow-up')) {
    suggestions.push(
      { text: 'What do I need to follow up on?', icon: 'action' },
      { text: 'Draft a follow-up message', icon: 'action' },
      { text: 'Summarize the pending items', icon: 'summary' }
    );
    return suggestions.slice(0, 3);
  }

  // VIP - high-touch focused
  if (tagNames.includes('vip')) {
    suggestions.push(
      { text: 'What topics are important to them?', icon: 'insight' },
      { text: 'How can I add value to this relationship?', icon: 'action' },
      { text: 'Prepare talking points for our next call', icon: 'prepare' }
    );
    return suggestions.slice(0, 3);
  }

  // Partner - collaboration-focused
  if (tagNames.includes('partner')) {
    suggestions.push(
      { text: 'What are our shared goals and projects?', icon: 'insight' },
      { text: 'Any blockers or issues to address?', icon: 'action' },
      { text: 'Summarize our partnership progress', icon: 'summary' }
    );
    return suggestions.slice(0, 3);
  }

  // Cold - re-engagement focused
  if (tagNames.includes('cold')) {
    suggestions.push(
      { text: 'Why did they go cold? Any signals?', icon: 'insight' },
      { text: 'Draft a re-engagement message', icon: 'action' },
      { text: 'What topics interested them before?', icon: 'summary' }
    );
    return suggestions.slice(0, 3);
  }

  // Support - service-focused
  if (tagNames.includes('support')) {
    suggestions.push(
      { text: 'What\'s their support issue?', icon: 'insight' },
      { text: 'Is this issue resolved?', icon: 'action' },
      { text: 'Summarize the support history', icon: 'summary' }
    );
    return suggestions.slice(0, 3);
  }

  // CONTEXT-BASED SUGGESTIONS (when no specific tag)

  // Group chats
  if (isGroup) {
    suggestions.push(
      { text: 'What are the main discussion topics?', icon: 'insight' },
      { text: 'Who are the key participants?', icon: 'insight' },
      { text: 'Any decisions or action items from the group?', icon: 'action' }
    );
    return suggestions.slice(0, 3);
  }

  // New conversation (few messages)
  if (messageCount < 10) {
    suggestions.push(
      { text: 'What do they need from me?', icon: 'insight' },
      { text: 'Key points from our initial conversation', icon: 'summary' },
      { text: 'Suggested next steps', icon: 'action' }
    );
    return suggestions.slice(0, 3);
  }

  // Dormant conversation
  if (isDormant) {
    suggestions.push(
      { text: 'When did we last talk and what about?', icon: 'summary' },
      { text: 'Draft a check-in message', icon: 'action' },
      { text: 'What were their main interests?', icon: 'insight' }
    );
    return suggestions.slice(0, 3);
  }

  // Recent activity
  if (isRecent) {
    suggestions.push(
      { text: 'What did we just discuss?', icon: 'summary' },
      { text: 'Any commitments or action items?', icon: 'action' },
      { text: 'Prepare for my next response', icon: 'prepare' }
    );
    return suggestions.slice(0, 3);
  }

  // Default suggestions
  return [
    { text: 'Summarize this conversation', icon: 'summary' },
    { text: 'What are the key discussion points?', icon: 'insight' },
    { text: 'Any action items or next steps?', icon: 'action' },
  ];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Store chat history per conversation (persists across navigation within session)
const chatHistoryCache = new Map<string, {
  messages: ChatMessage[];
  deepAnalysis: boolean;
  contextInfo: { messagesUsed: number; totalMessages: number } | null;
}>();

// Store active tab per conversation
const activeTabCache = new Map<string, TabType>();

export default function AIAssistant({ conversation }: AIAssistantProps) {
  // Tab state - default to AI, but remember per conversation
  const [activeTab, setActiveTab] = useState<TabType>('ai');
  const [notesCount, setNotesCount] = useState(0);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isChatFocused, setIsChatFocused] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Deep Analysis mode state
  const [deepAnalysis, setDeepAnalysis] = useState(false);
  const [contextInfo, setContextInfo] = useState<{
    messagesUsed: number;
    totalMessages: number;
  } | null>(null);

  // Tooltip state
  const [hoveredTab, setHoveredTab] = useState<TabType | null>(null);

  // Track previous conversation to save state before switching
  const prevConversationIdRef = useRef<string | null>(null);

  // Save current chat state to cache when conversation changes
  useEffect(() => {
    // Save previous conversation's state
    if (prevConversationIdRef.current && prevConversationIdRef.current !== conversation?.id) {
      const prevId = prevConversationIdRef.current;
      // Save chat state
      if (chatMessages.length > 0) {
        chatHistoryCache.set(prevId, {
          messages: chatMessages,
          deepAnalysis,
          contextInfo,
        });
      }
      // Save active tab
      activeTabCache.set(prevId, activeTab);
    }

    // Load or reset state for new conversation
    if (conversation?.id) {
      // Load chat state
      const cached = chatHistoryCache.get(conversation.id);
      if (cached) {
        setChatMessages(cached.messages);
        setDeepAnalysis(cached.deepAnalysis);
        setContextInfo(cached.contextInfo);
      } else {
        setChatMessages([]);
        setDeepAnalysis(false);
        setContextInfo(null);
      }

      // Load active tab (default to AI for new conversations)
      const cachedTab = activeTabCache.get(conversation.id);
      setActiveTab(cachedTab || 'ai');

      // Reset notes count immediately, then fetch actual count
      setNotesCount(0);
    }

    // Update ref for next change
    prevConversationIdRef.current = conversation?.id || null;
  }, [conversation?.id]);

  // Fetch notes count when conversation changes (independent of active tab)
  useEffect(() => {
    if (!conversation?.id) return;

    const fetchNotesCount = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversation.id}/notes`);
        const data = await response.json();
        if (data.success) {
          setNotesCount(data.data.notes?.length || 0);
        }
      } catch (error) {
        console.error('Failed to fetch notes count:', error);
      }
    };

    fetchNotesCount();
  }, [conversation?.id]);

  // Scroll to bottom when new chat messages arrive or when switching to AI tab
  // Use multiple strategies to ensure reliable scrolling
  useEffect(() => {
    if (activeTab !== 'ai') return;

    const scrollToBottom = () => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    };

    // Strategy 1: Immediate scroll
    scrollToBottom();

    // Strategy 2: After React's paint (for tab switches)
    requestAnimationFrame(() => {
      scrollToBottom();
      // Strategy 3: Double RAF for layout completion
      requestAnimationFrame(scrollToBottom);
    });

    // Strategy 4: Fallback timeout for slower renders
    const timeout = setTimeout(scrollToBottom, 50);

    return () => clearTimeout(timeout);
  }, [chatMessages, activeTab]);

  // Keyboard shortcuts for tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (document.activeElement === chatInputRef.current) {
        // Only handle / shortcut to focus
        if (e.key === 'Escape') {
          chatInputRef.current?.blur();
        }
        return;
      }

      // Tab switching: 1 for AI, 2 for Notes
      if (e.key === '1' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setActiveTab('ai');
        if (conversation?.id) activeTabCache.set(conversation.id, 'ai');
      }
      if (e.key === '2' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setActiveTab('notes');
        if (conversation?.id) activeTabCache.set(conversation.id, 'notes');
      }

      // / to focus chat input (only when on AI tab)
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && activeTab === 'ai') {
        e.preventDefault();
        chatInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, conversation?.id]);

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || !conversation?.id || chatLoading) return;

    const promptLength = chatInput.trim().length;

    // Track AI prompt submitted
    track('ai_prompt_submitted', { promptLength }, { conversationId: conversation.id });

    const startTime = performance.now();

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await fetch(`/api/conversations/${conversation.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          chatHistory: chatMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          deepAnalysis,
        }),
      });

      const data = await response.json();

      const durationMs = Math.round(performance.now() - startTime);

      if (data.success) {
        // Track AI response received
        track('ai_response_received', { durationMs, success: true }, { conversationId: conversation.id });

        // Update context info from response
        if (data.data.context) {
          setContextInfo({
            messagesUsed: data.data.context.messagesUsed,
            totalMessages: data.data.context.totalMessages,
          });
        }

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.data.response,
          timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, assistantMessage]);
      } else {
        // Track AI response failure
        track('ai_response_received', { durationMs, success: false }, { conversationId: conversation.id });

        // Show error message in chat
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${data.error || 'Failed to get response'}`,
          timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Failed to connect to AI service. Please try again.',
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  // Handle tab change
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (conversation?.id) {
      activeTabCache.set(conversation.id, tab);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header with Tabs - Linear style */}
      <div style={{
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {/* Tab Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: '2px',
        }}>
          {/* AI Tab */}
          <TabButton
            isActive={activeTab === 'ai'}
            onClick={() => handleTabChange('ai')}
            onMouseEnter={() => setHoveredTab('ai')}
            onMouseLeave={() => setHoveredTab(null)}
            shortcut="1"
          >
            <SparklesIcon style={{ width: '14px', height: '14px' }} />
            <span>AI Assistant</span>
          </TabButton>

          {/* Notes Tab */}
          <div style={{ position: 'relative' }}>
            <TabButton
              isActive={activeTab === 'notes'}
              onClick={() => handleTabChange('notes')}
              onMouseEnter={() => setHoveredTab('notes')}
              onMouseLeave={() => setHoveredTab(null)}
              shortcut="2"
              badge={notesCount > 0 ? notesCount : undefined}
            >
              <NotesIcon style={{ width: '14px', height: '14px' }} />
              <span>Notes</span>
            </TabButton>

            {/* Notes tooltip */}
            {hoveredTab === 'notes' && (
              <Tooltip>
                Track context over time with notes, meeting summaries, and file attachments. AI uses notes for context.
              </Tooltip>
            )}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Keyboard hint */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            paddingRight: '4px',
          }}>
            <kbd style={{
              fontSize: '10px',
              padding: '2px 5px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              color: 'var(--text-quaternary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {activeTab === 'ai' ? '/' : 'N'}
            </kbd>
          </div>
        </div>
      </div>

      {/* Tab Content - Both tabs always rendered, inactive one hidden */}
      {/* AI Assistant Tab Content */}
      <div
        style={{
          display: activeTab === 'ai' ? 'flex' : 'none',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0, // Important for flex child overflow
        }}
      >
        {/* Chat Messages */}
        <div
          ref={chatContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
            {chatMessages.length === 0 ? (
              <EmptyState
                conversation={conversation}
                onSuggestionClick={(text) => {
                  setChatInput(text);
                  chatInputRef.current?.focus();
                  // Auto-submit the suggestion
                  setTimeout(() => {
                    const userMessage: ChatMessage = {
                      id: `user-${Date.now()}`,
                      role: 'user',
                      content: text,
                      timestamp: new Date(),
                    };
                    setChatMessages(prev => [...prev, userMessage]);
                    setChatInput('');
                    setChatLoading(true);

                    // Submit the message
                    fetch(`/api/conversations/${conversation?.id}/chat`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        message: text,
                        chatHistory: [],
                        deepAnalysis,
                      }),
                    })
                      .then(res => res.json())
                      .then(data => {
                        if (data.success) {
                          // Update context info
                          if (data.data.context) {
                            setContextInfo({
                              messagesUsed: data.data.context.messagesUsed,
                              totalMessages: data.data.context.totalMessages,
                            });
                          }

                          const assistantMessage: ChatMessage = {
                            id: `assistant-${Date.now()}`,
                            role: 'assistant',
                            content: data.data.response,
                            timestamp: new Date(),
                          };
                          setChatMessages(prev => [...prev, assistantMessage]);
                        } else {
                          const errorMessage: ChatMessage = {
                            id: `error-${Date.now()}`,
                            role: 'assistant',
                            content: `Error: ${data.error || 'Failed to get response'}`,
                            timestamp: new Date(),
                          };
                          setChatMessages(prev => [...prev, errorMessage]);
                        }
                      })
                      .catch(() => {
                        const errorMessage: ChatMessage = {
                          id: `error-${Date.now()}`,
                          role: 'assistant',
                          content: 'Failed to connect to AI service. Please try again.',
                          timestamp: new Date(),
                        };
                        setChatMessages(prev => [...prev, errorMessage]);
                      })
                      .finally(() => {
                        setChatLoading(false);
                      });
                  }, 0);
                }}
                notesCount={notesCount}
                onViewNotes={() => handleTabChange('notes')}
              />
            ) : (
              chatMessages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))
            )}
            {chatLoading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-3)',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                alignSelf: 'flex-start',
                maxWidth: '85%',
              }}>
                <LoadingSpinner size={14} />
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                  Thinking...
                </span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '0 var(--space-3)',
              height: '40px',
              background: 'var(--bg-primary)',
              border: `1px solid ${isChatFocused ? 'var(--accent-primary)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-md)',
              transition: 'all 150ms ease',
              boxShadow: isChatFocused ? '0 0 0 3px var(--accent-subtle)' : 'none',
            }}>
              <SparklesIcon style={{
                width: '14px',
                height: '14px',
                color: isChatFocused ? 'var(--accent-primary)' : 'var(--text-quaternary)',
                flexShrink: 0,
                transition: 'color 150ms ease',
              }} />
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit();
                  }
                  if (e.key === 'Escape') {
                    setChatInput('');
                    chatInputRef.current?.blur();
                  }
                }}
                onFocus={() => setIsChatFocused(true)}
                onBlur={() => setIsChatFocused(false)}
                placeholder="Ask about this conversation..."
                disabled={chatLoading || !conversation}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: 'var(--font-sans)',
                }}
              />
              {chatInput && (
                <kbd style={{
                  fontSize: '10px',
                  padding: '2px 5px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-quaternary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  ↵
                </kbd>
              )}
            </div>
            {/* Context info and controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 'var(--space-2)',
              gap: 'var(--space-2)',
            }}>
              {/* Left: Context indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1 }}>
                <span style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>
                  {contextInfo ? (
                    contextInfo.messagesUsed < contextInfo.totalMessages
                      ? `Using ${contextInfo.messagesUsed} of ${contextInfo.totalMessages} messages`
                      : `Using all ${contextInfo.totalMessages} messages`
                  ) : (
                    <>
                      Context: messages
                      {notesCount > 0 && (
                        <> + <span style={{ color: 'var(--accent-primary)' }}>{notesCount} notes</span></>
                      )}
                    </>
                  )}
                </span>
              </div>

              {/* Right: Deep Analysis toggle + Clear */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                {/* Deep Analysis toggle - only show for larger conversations */}
                {(conversation?.totalMessages || 0) > 50 && (
                  <DeepAnalysisToggle
                    enabled={deepAnalysis}
                    onToggle={() => setDeepAnalysis(!deepAnalysis)}
                    totalMessages={conversation?.totalMessages || 0}
                  />
                )}

                {chatMessages.length > 0 && (
                  <button
                    onClick={() => {
                      setChatMessages([]);
                      setContextInfo(null);
                      // Also clear from cache so it doesn't restore on re-navigation
                      if (conversation?.id) {
                        chatHistoryCache.delete(conversation.id);
                      }
                    }}
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-tertiary)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

      {/* Notes Tab Content - Always rendered, hidden when not active */}
      <div
        style={{
          display: activeTab === 'notes' ? 'flex' : 'none',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {conversation && (
          <NotesTimeline
            conversationId={conversation.id}
            isExpanded={true}
            onToggleExpanded={() => {}}
            onNotesCountChange={setNotesCount}
            fullHeight={true}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// Tab Button Component - Linear Style
// ============================================
function TabButton({
  isActive,
  onClick,
  onMouseEnter,
  onMouseLeave,
  children,
  shortcut,
  badge,
}: {
  isActive: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
  shortcut?: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '10px 12px',
        fontSize: '13px',
        fontWeight: isActive ? '600' : '500',
        color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
        background: 'transparent',
        border: 'none',
        borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 100ms ease',
        marginBottom: '-1px',
        position: 'relative',
      }}
    >
      {children}
      {badge !== undefined && badge > 0 ? (
        // Show badge when there's data - hide keyboard shortcut to avoid confusion
        <span style={{
          fontSize: '10px',
          fontWeight: '600',
          color: 'var(--accent-primary)',
          background: 'var(--accent-subtle)',
          padding: '1px 5px',
          borderRadius: '10px',
          minWidth: '16px',
          textAlign: 'center',
        }}>
          {badge}
        </span>
      ) : (
        // Show keyboard shortcut only when no badge and not active
        shortcut && !isActive && (
          <kbd style={{
            fontSize: '9px',
            padding: '1px 4px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '3px',
            color: 'var(--text-quaternary)',
            fontFamily: 'var(--font-mono)',
            marginLeft: '2px',
          }}>
            {shortcut}
          </kbd>
        )
      )}
    </button>
  );
}

// ============================================
// Tooltip Component - Linear Style
// ============================================
function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: '8px',
        padding: '10px 12px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        width: '220px',
        zIndex: 100,
        fontSize: '12px',
        color: 'var(--text-secondary)',
        lineHeight: '1.4',
      }}
    >
      {children}
      {/* Arrow */}
      <div
        style={{
          position: 'absolute',
          top: '-6px',
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: '10px',
          height: '10px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-default)',
          borderBottom: 'none',
          borderRight: 'none',
        }}
      />
    </div>
  );
}

// ============================================
// Deep Analysis Toggle Component
// ============================================
function DeepAnalysisToggle({
  enabled,
  onToggle,
  totalMessages,
}: {
  enabled: boolean;
  onToggle: () => void;
  totalMessages: number;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          fontSize: '10px',
          fontWeight: '500',
          color: enabled ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          background: enabled ? 'var(--accent-subtle)' : 'transparent',
          border: `1px solid ${enabled ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
          borderRadius: '12px',
          cursor: 'pointer',
          transition: 'all 150ms ease',
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          style={{ opacity: enabled ? 1 : 0.6 }}
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
          <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Deep Analysis
      </button>

      {/* Tooltip explaining what Deep Analysis does */}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '8px',
            padding: '10px 12px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            width: '220px',
            zIndex: 100,
          }}
        >
          <div style={{
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '6px',
          }}>
            {enabled ? 'Deep Analysis Enabled' : 'Enable Deep Analysis'}
          </div>
          <div style={{
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            lineHeight: '1.4',
          }}>
            {enabled ? (
              <>
                <span style={{ color: 'var(--accent-primary)' }}>Now using:</span> Up to 500 messages for comprehensive analysis
              </>
            ) : (
              <>
                <span style={{ fontWeight: '500' }}>Standard:</span> Last 50 messages<br />
                <span style={{ fontWeight: '500' }}>Deep Analysis:</span> Up to 500 messages
              </>
            )}
          </div>
          <div style={{
            fontSize: '10px',
            color: 'var(--text-quaternary)',
            marginTop: '6px',
            paddingTop: '6px',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            This conversation has {totalMessages} messages
          </div>
          {/* Tooltip arrow */}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              right: '20px',
              width: '12px',
              height: '12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              borderTop: 'none',
              borderLeft: 'none',
              transform: 'rotate(45deg)',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================
// Chat Bubble Component
// ============================================
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    // User message - right aligned, darker background, no icon needed
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        maxWidth: '85%',
        alignSelf: 'flex-end',
      }}>
        <div style={{
          padding: '10px 12px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          borderRadius: '12px',
          borderBottomRightRadius: '4px',
          border: '1px solid var(--border-default)',
        }}>
          <p style={{
            margin: 0,
            fontSize: '13px',
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
          }}>
            {message.content}
          </p>
        </div>
        <span style={{
          fontSize: '10px',
          color: 'var(--text-quaternary)',
          marginTop: '4px',
          paddingRight: '4px',
        }}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    );
  }

  // AI message - left aligned with avatar icon
  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      maxWidth: '90%',
      alignSelf: 'flex-start',
    }}>
      {/* AI Avatar */}
      <div style={{
        width: '24px',
        height: '24px',
        borderRadius: '6px',
        background: 'linear-gradient(135deg, var(--accent-primary) 0%, #8B5CF6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginTop: '2px',
      }}>
        <SparklesIcon style={{ width: '12px', height: '12px', color: 'white' }} />
      </div>

      {/* Message content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          padding: '10px 12px',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          borderRadius: '12px',
          borderTopLeftRadius: '4px',
          border: '1px solid var(--border-subtle)',
        }}>
          <p style={{
            margin: 0,
            fontSize: '13px',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
          }}>
            {message.content}
          </p>
        </div>
        <span style={{
          fontSize: '10px',
          color: 'var(--text-quaternary)',
          marginTop: '4px',
          paddingLeft: '4px',
          display: 'block',
        }}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

// ============================================
// Empty State with Contextual Suggestions
// ============================================
function EmptyState({
  conversation,
  onSuggestionClick,
  notesCount,
  onViewNotes,
}: {
  conversation: Conversation | null;
  onSuggestionClick: (text: string) => void;
  notesCount: number;
  onViewNotes: () => void;
}) {
  const suggestions = getContextualSuggestions(conversation);

  // Get context label based on conversation state
  const getContextLabel = () => {
    if (!conversation) return null;

    const tags = conversation.tags || [];
    if (tags.length > 0) {
      // Show first tag as context
      const tag = tags[0];
      return { name: tag.name, color: tag.color || '#6b7280' };
    }

    // Fallback context based on conversation type
    if (conversation.type === 'group' || conversation.type === 'supergroup') {
      return { name: 'Group Chat', color: '#3b82f6' };
    }

    return null;
  };

  const contextLabel = getContextLabel();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      textAlign: 'center',
      flex: 1,
    }}>
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, var(--accent-subtle) 0%, rgba(139, 92, 246, 0.1) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '12px',
      }}>
        <SparklesIcon style={{ width: '22px', height: '22px', color: 'var(--accent-primary)' }} />
      </div>

      <p style={{
        fontSize: '14px',
        color: 'var(--text-secondary)',
        margin: '0 0 4px 0',
        fontWeight: '500',
      }}>
        Ask AI about this conversation
      </p>

      <p style={{
        fontSize: '12px',
        color: 'var(--text-quaternary)',
        margin: 0,
        maxWidth: '220px',
        lineHeight: '1.4',
      }}>
        Get insights from messages{notesCount > 0 ? ` and ${notesCount} notes` : ''}
      </p>

      {/* Context label - shows what the suggestions are tailored for */}
      {contextLabel && (
        <div style={{
          marginTop: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: contextLabel.color,
          }} />
          <span style={{
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            fontWeight: '500',
          }}>
            Tailored for {contextLabel.name}
          </span>
        </div>
      )}

      {/* Suggestion chips */}
      <div style={{
        marginTop: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        maxWidth: '260px',
      }}>
        {suggestions.map((suggestion, index) => (
          <SuggestionChip
            key={index}
            text={suggestion.text}
            icon={suggestion.icon}
            onClick={() => onSuggestionClick(suggestion.text)}
          />
        ))}
      </div>

      {/* Notes hint if no notes */}
      {notesCount === 0 && (
        <button
          onClick={onViewNotes}
          style={{
            marginTop: '20px',
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <NotesIcon style={{ width: '12px', height: '12px' }} />
          <span>Add notes for richer AI context</span>
          <span style={{ color: 'var(--text-quaternary)' }}>→</span>
        </button>
      )}
    </div>
  );
}

// ============================================
// Suggestion Chip with Icon
// ============================================
function SuggestionChip({
  text,
  icon,
  onClick
}: {
  text: string;
  icon?: 'summary' | 'action' | 'insight' | 'prepare';
  onClick?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Get icon component based on type
  const renderIcon = () => {
    const iconStyle = {
      width: '12px',
      height: '12px',
      color: isHovered ? 'var(--accent-primary)' : 'var(--text-quaternary)',
      flexShrink: 0 as const,
      transition: 'color 150ms ease',
    };

    switch (icon) {
      case 'summary':
        return (
          <svg style={iconStyle} viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'action':
        return (
          <svg style={iconStyle} viewBox="0 0 16 16" fill="none">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'insight':
        return (
          <svg style={iconStyle} viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'prepare':
        return (
          <svg style={iconStyle} viewBox="0 0 16 16" fill="none">
            <path d="M2 12l4-4 3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        fontSize: '12px',
        color: isHovered ? 'var(--text-secondary)' : 'var(--text-tertiary)',
        background: isHovered ? 'var(--bg-hover)' : 'var(--bg-secondary)',
        border: `1px solid ${isHovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 150ms ease',
        lineHeight: '1.4',
      }}
    >
      {icon && renderIcon()}
      <span style={{ flex: 1 }}>{text}</span>
      <svg
        style={{
          width: '12px',
          height: '12px',
          color: isHovered ? 'var(--text-tertiary)' : 'var(--text-quaternary)',
          opacity: isHovered ? 1 : 0,
          transform: isHovered ? 'translateX(0)' : 'translateX(-4px)',
          transition: 'all 150ms ease',
          flexShrink: 0,
        }}
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ============================================
// Loading Spinner
// ============================================
function LoadingSpinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="32"
        strokeDashoffset="12"
        opacity="0.3"
      />
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="var(--accent-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="32"
        strokeDashoffset="24"
      />
    </svg>
  );
}

// ============================================
// Icons
// ============================================
function SparklesIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1L9.17 5.83L14 7L9.17 8.17L8 13L6.83 8.17L2 7L6.83 5.83L8 1Z"
        fill="currentColor"
      />
      <path
        d="M12 10L12.5 12L14 12.5L12.5 13L12 15L11.5 13L10 12.5L11.5 12L12 10Z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}

function NotesIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 3C3 2.44772 3.44772 2 4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M5.5 5H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 8H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 11H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
