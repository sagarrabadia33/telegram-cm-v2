'use client';

import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { MessageBubble, MessageInputWrapper, groupMessagesByDate, LoadingSpinner } from './MessageView';
import { Message } from '../types';
import { formatDate } from '../lib/utils';

interface CompactChatViewProps {
  conversationId: string;
  isGroup?: boolean;
  onSendMessage: (text: string) => void;
  onSendWithAttachment?: (text: string, attachment: { type: string; url: string; filename?: string; mimeType: string }) => void;
  onReact?: (messageId: string, emoji: string, action: 'add' | 'remove') => void;
  // Draft reply from DraftReplySection
  draftReply?: string;
  onDraftUsed?: () => void;
}

/**
 * CompactChatView - Lightweight chat component for the slide panel
 *
 * Features:
 * - Reuses MessageBubble and MessageInputWrapper from MessageView
 * - Optimized for narrower panel width (25vw)
 * - Infinite scroll for older messages
 * - Smooth animations
 */
export default function CompactChatView({
  conversationId,
  isGroup = false,
  onSendMessage,
  onSendWithAttachment,
  onReact,
  draftReply,
  onDraftUsed,
}: CompactChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const prevScrollHeightRef = useRef<number>(0);
  const isLoadingOlderRef = useRef(false);

  // Fetch messages for conversation
  const fetchMessages = useCallback(async (cursor?: string) => {
    if (!conversationId) return;

    try {
      const params = new URLSearchParams({
        limit: '50',
        ...(cursor && { cursor }),
      });

      const res = await fetch(`/api/conversations/${conversationId}/messages?${params}`);
      if (!res.ok) throw new Error('Failed to fetch messages');

      const data = await res.json();

      if (cursor) {
        // Loading older messages - prepend
        setMessages(prev => [...data.messages.reverse(), ...prev]);
      } else {
        // Initial load
        setMessages(data.messages.reverse());
      }

      setHasMore(data.pagination?.hasMore || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [conversationId]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    setMessages([]);
    fetchMessages();
  }, [fetchMessages, conversationId]);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    if (!conversationId) return;

    const interval = setInterval(() => {
      // Soft refresh - just check for new messages
      fetchMessages();
    }, 5000);

    return () => clearInterval(interval);
  }, [conversationId, fetchMessages]);

  // Scroll behavior - instant on load, smooth on new messages
  useLayoutEffect(() => {
    const isNewMessage = messages.length > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0;

    if (messagesEndRef.current && messagesContainerRef.current) {
      if (prevMessagesLengthRef.current === 0) {
        // Initial load: instant scroll
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        isLoadingOlderRef.current = false;
      } else if (isNewMessage && !isLoadingOlderRef.current) {
        // New message: smooth scroll
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      } else if (isLoadingOlderRef.current) {
        // Older messages loaded: preserve position
        const newScrollHeight = messagesContainerRef.current.scrollHeight;
        const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
        messagesContainerRef.current.scrollTop += scrollDiff;
        isLoadingOlderRef.current = false;
      }
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
          // Get oldest message for cursor
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

  // Handle draft reply insertion
  useEffect(() => {
    if (draftReply && draftReply !== '[NO_REPLY_NEEDED]') {
      setInputValue(draftReply);
      // Focus and select all for easy editing
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 100);
      onDraftUsed?.();
    }
  }, [draftReply, onDraftUsed]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  // Group messages by date
  const groupedMessages = groupMessagesByDate(messages);

  if (isLoading) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}>
        <LoadingSpinner size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-tertiary)',
        fontSize: 'var(--text-sm)',
        padding: 'var(--space-4)',
        textAlign: 'center',
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
    }}>
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        {/* Load more trigger */}
        {hasMore && (
          <div ref={loadMoreTriggerRef} style={{ padding: '8px 0', textAlign: 'center' }}>
            {isLoadingMore ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <LoadingSpinner size={14} />
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Loading...</span>
              </div>
            ) : (
              <span style={{ fontSize: '10px', color: 'var(--text-quaternary)' }}>↑ Scroll for older</span>
            )}
          </div>
        )}

        {messages.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-sm)',
          }}>
            No messages yet
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date divider - compact */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-2) 0',
              }}>
                <span style={{
                  fontSize: '10px',
                  color: 'var(--text-quaternary)',
                  background: 'var(--bg-secondary)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                }}>
                  {formatDate(group.date)}
                </span>
              </div>

              {/* Messages for this date */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}>
                {group.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isGroup={isGroup}
                    onReact={onReact}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area - compact */}
      <div style={{
        padding: 'var(--space-2) var(--space-3)',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
      }}>
        <MessageInputWrapper
          textareaRef={textareaRef}
          inputValue={inputValue}
          onInputChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onSend={handleSend}
          onSendWithAttachment={onSendWithAttachment}
          conversationId={conversationId}
          isGroup={isGroup}
        />
      </div>
    </div>
  );
}
