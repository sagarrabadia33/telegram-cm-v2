'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Conversation } from '../types';

interface AIAssistantProps {
  conversation: Conversation | null;
}

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

export default function AIAssistant({ conversation }: AIAssistantProps) {
  // Notes state
  const [notes, setNotes] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const notesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Load notes when conversation changes
  useEffect(() => {
    if (conversation?.id) {
      loadNotes(conversation.id);
      // Reset chat and deep analysis when conversation changes
      setChatMessages([]);
      setDeepAnalysis(false);
      setContextInfo(null);
    }
  }, [conversation?.id]);

  // Auto-save notes with debounce
  useEffect(() => {
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }

    if (conversation?.id && notes !== undefined) {
      notesTimeoutRef.current = setTimeout(() => {
        saveNotes(conversation.id, notes);
      }, 1000);
    }

    return () => {
      if (notesTimeoutRef.current) {
        clearTimeout(notesTimeoutRef.current);
      }
    };
  }, [notes, conversation?.id]);

  // Scroll to bottom when new chat messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const loadNotes = async (conversationId: string) => {
    setNotesLoading(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`);
      const data = await response.json();
      if (data.success) {
        setNotes(data.data.notes || '');
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setNotesLoading(false);
    }
  };

  const saveNotes = async (conversationId: string, notesContent: string) => {
    setNotesSaving(true);
    try {
      await fetch(`/api/conversations/${conversationId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesContent }),
      });
    } catch (error) {
      console.error('Failed to save notes:', error);
    } finally {
      setNotesSaving(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || !conversation?.id || chatLoading) return;

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

      if (data.success) {
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

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement === chatInputRef.current) return;

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        chatInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, #8B5CF6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <SparklesIcon style={{ width: '14px', height: '14px', color: 'white' }} />
          </div>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--text-primary)',
          }}>
            AI Assistant
          </span>
        </div>
        <kbd style={{
          fontSize: '10px',
          padding: '2px 5px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-quaternary)',
          fontFamily: 'var(--font-mono)',
        }}>
          /
        </kbd>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Notes Section */}
        <div style={{
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={() => setNotesExpanded(!notesExpanded)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--bg-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <NotesIcon style={{ width: '14px', height: '14px', color: 'var(--text-tertiary)' }} />
              <span style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--text-secondary)',
              }}>
                Context Notes
              </span>
              {notesSaving && (
                <span style={{
                  fontSize: '10px',
                  color: 'var(--text-quaternary)',
                  fontStyle: 'italic',
                }}>
                  Saving...
                </span>
              )}
              {notes && !notesSaving && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent-primary)',
                  borderRadius: 'var(--radius-full)',
                }}>
                  Has notes
                </span>
              )}
            </div>
            <ChevronIcon style={{
              width: '14px',
              height: '14px',
              color: 'var(--text-quaternary)',
              transform: notesExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease',
            }} />
          </button>

          {notesExpanded && (
            <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
              {notesLoading ? (
                <div style={{
                  height: '80px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <LoadingSpinner size={16} />
                </div>
              ) : (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add background context"
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: 'var(--space-3)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: '1.5',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent-primary)';
                    e.target.style.boxShadow = '0 0 0 3px var(--accent-subtle)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border-default)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              )}
              <p style={{
                fontSize: '11px',
                color: 'var(--text-quaternary)',
                marginTop: 'var(--space-2)',
                margin: 'var(--space-2) 0 0 0',
              }}>
                Notes are automatically saved and used as AI context
              </p>
            </div>
          )}
        </div>

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
                'Context: messages + notes'
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
          fontWeight: 'var(--font-medium)',
          color: enabled ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          background: enabled ? 'var(--accent-subtle)' : 'transparent',
          border: `1px solid ${enabled ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-full)',
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
            padding: 'var(--space-3)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            width: '220px',
            zIndex: 100,
          }}
        >
          <div style={{
            fontSize: '11px',
            fontWeight: 'var(--font-semibold)',
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
                <span style={{ fontWeight: 'var(--font-medium)' }}>Standard:</span> Last 50 messages<br />
                <span style={{ fontWeight: 'var(--font-medium)' }}>Deep Analysis:</span> Up to 500 messages
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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '85%',
      alignSelf: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        padding: 'var(--space-3)',
        background: isUser ? 'var(--accent-primary)' : 'var(--bg-secondary)',
        color: isUser ? 'white' : 'var(--text-primary)',
        borderRadius: 'var(--radius-lg)',
        borderBottomRightRadius: isUser ? 'var(--radius-sm)' : 'var(--radius-lg)',
        borderBottomLeftRadius: isUser ? 'var(--radius-lg)' : 'var(--radius-sm)',
        border: isUser ? 'none' : '1px solid var(--border-subtle)',
      }}>
        <p style={{
          margin: 0,
          fontSize: 'var(--text-sm)',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </p>
      </div>
      <span style={{
        fontSize: '10px',
        color: 'var(--text-quaternary)',
        marginTop: 'var(--space-1)',
        paddingLeft: isUser ? '0' : 'var(--space-2)',
        paddingRight: isUser ? 'var(--space-2)' : '0',
      }}>
        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

// ============================================
// Empty State with Contextual Suggestions
// ============================================
function EmptyState({
  conversation,
  onSuggestionClick
}: {
  conversation: Conversation | null;
  onSuggestionClick: (text: string) => void;
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
      padding: 'var(--space-6) var(--space-4)',
      textAlign: 'center',
      flex: 1,
    }}>
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: 'var(--radius-lg)',
        background: 'linear-gradient(135deg, var(--accent-subtle) 0%, rgba(139, 92, 246, 0.1) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 'var(--space-3)',
      }}>
        <SparklesIcon style={{ width: '22px', height: '22px', color: 'var(--accent-primary)' }} />
      </div>

      <p style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        margin: '0 0 var(--space-1) 0',
        fontWeight: 'var(--font-medium)',
      }}>
        Ask AI about this conversation
      </p>

      <p style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-quaternary)',
        margin: 0,
        maxWidth: '200px',
        lineHeight: '1.4',
      }}>
        Get insights, prepare for calls, or understand context from your message history and notes
      </p>

      {/* Context label - shows what the suggestions are tailored for */}
      {contextLabel && (
        <div style={{
          marginTop: 'var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-full)',
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
            fontWeight: 'var(--font-medium)',
          }}>
            Tailored for {contextLabel.name}
          </span>
        </div>
      )}

      {/* Suggestion chips */}
      <div style={{
        marginTop: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
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
      flexShrink: 0,
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
        fontSize: 'var(--text-xs)',
        color: isHovered ? 'var(--text-secondary)' : 'var(--text-tertiary)',
        background: isHovered ? 'var(--bg-hover)' : 'var(--bg-secondary)',
        border: `1px solid ${isHovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
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
    <svg style={style} viewBox="0 0 14 14" fill="none">
      <path
        d="M2 2.5C2 1.67 2.67 1 3.5 1H10.5C11.33 1 12 1.67 12 2.5V11.5C12 12.33 11.33 13 10.5 13H3.5C2.67 13 2 12.33 2 11.5V2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M4.5 4H9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.5 6.5H9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.5 9H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 14 14" fill="none">
      <path
        d="M3.5 5.5L7 9L10.5 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
