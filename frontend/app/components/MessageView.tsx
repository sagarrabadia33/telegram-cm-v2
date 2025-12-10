'use client';

import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { SendIcon, AttachmentIcon, EmojiIcon, MoreIcon, SingleCheckIcon, DoubleCheckIcon, ClockIcon, DownloadIcon } from './Icons';
import { Conversation, Message } from '../types';
import { formatMessageTime, formatDate } from '../lib/utils';
import { ConversationSummary } from './ConversationSummary';
import { TagSelector, Tag } from './TagSelector';

interface MessageViewProps {
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onSendWithAttachment?: (text: string, attachment: { type: string; url: string; filename?: string; mimeType: string }) => void;
  onTagsChange?: (conversationId: string, tags: Tag[]) => void;
  highlightMessageId?: string | null;
  // Infinite scroll for older messages
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export default function MessageView({
  conversation,
  messages,
  onSendMessage,
  onSendWithAttachment,
  onTagsChange,
  highlightMessageId,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: MessageViewProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const prevConversationIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isLoadingOlderRef = useRef(false);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Like Telegram/WhatsApp: instantly show latest messages on load, smooth scroll only for new messages
  useLayoutEffect(() => {
    const isNewConversation = prevConversationIdRef.current !== conversation?.id;
    const isNewMessage = messages.length > prevMessagesLengthRef.current && !isNewConversation;

    if (messagesEndRef.current && messagesContainerRef.current) {
      if (isNewConversation || prevMessagesLengthRef.current === 0) {
        // Initial load or conversation change: instant scroll (no animation)
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        isLoadingOlderRef.current = false;
      } else if (isNewMessage && !isLoadingOlderRef.current) {
        // New message added: smooth scroll (only if we're not loading older messages)
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      } else if (isLoadingOlderRef.current) {
        // Older messages loaded: preserve scroll position
        const newScrollHeight = messagesContainerRef.current.scrollHeight;
        const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
        messagesContainerRef.current.scrollTop += scrollDiff;
        isLoadingOlderRef.current = false;
      }
    }

    prevMessagesLengthRef.current = messages.length;
    prevConversationIdRef.current = conversation?.id || null;
  }, [messages, conversation?.id]);

  // Intersection observer for loading older messages (triggers at TOP of list)
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          // Save scroll height before loading more
          if (messagesContainerRef.current) {
            prevScrollHeightRef.current = messagesContainerRef.current.scrollHeight;
          }
          isLoadingOlderRef.current = true;
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore]);

  // Scroll to and highlight a specific message from search
  useEffect(() => {
    if (highlightMessageId && messages.length > 0) {
      // Wait a tick for messages to render
      setTimeout(() => {
        const messageElement = messageRefs.current.get(highlightMessageId);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightMessageId, messages]);

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
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  if (!conversation) {
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: 'var(--space-8)' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-4)',
            color: 'var(--text-quaternary)',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 style={{
            fontSize: 'var(--title-md)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-2)',
          }}>
            Select a conversation
          </h3>
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-tertiary)',
            maxWidth: '280px',
          }}>
            Choose a conversation from the left panel to start messaging
          </p>
        </div>
      </div>
    );
  }

  // Group messages by date
  const groupedMessages = groupMessagesByDate(messages);
  const isGroup = conversation.type === 'group' || conversation.type === 'supergroup';

  // Telegram-style avatar colors (7 vibrant colors - using hex values for inline styles)
  const AVATAR_COLORS = [
    { bg: '#E17076', text: '#FFFFFF' }, // Red
    { bg: '#FAA774', text: '#FFFFFF' }, // Orange
    { bg: '#A695E7', text: '#FFFFFF' }, // Violet
    { bg: '#7BC862', text: '#FFFFFF' }, // Green
    { bg: '#6EC9CB', text: '#FFFFFF' }, // Cyan
    { bg: '#65AADD', text: '#FFFFFF' }, // Blue
    { bg: '#EE7AAE', text: '#FFFFFF' }, // Pink
  ];

  // Get consistent color based on conversation ID (like Telegram)
  const getAvatarColorScheme = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };

  // Get 2-letter initials (like Telegram)
  const getInitials = (name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const colorScheme = getAvatarColorScheme(conversation.id);
  const avatarBg = colorScheme.bg;
  const avatarColor = colorScheme.text;

  // Track if avatar image failed to load
  const [headerAvatarError, setHeaderAvatarError] = useState(false);
  const hasHeaderAvatar = conversation.avatarUrl && !headerAvatarError;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-4)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div className="relative">
            {hasHeaderAvatar ? (
              // Actual avatar image
              <img
                src={conversation.avatarUrl!.startsWith('/media/')
                  ? `/api${conversation.avatarUrl}`
                  : conversation.avatarUrl!}
                alt={conversation.name}
                onError={() => setHeaderAvatarError(true)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-full)',
                  objectFit: 'cover',
                }}
              />
            ) : (
              // Fallback: vibrant colored initials or group icon
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                background: avatarBg,
                color: avatarColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'var(--font-semibold)',
              }}>
                {isGroup ? (
                  <GroupIcon style={{ width: '18px', height: '18px' }} />
                ) : (
                  // 2-letter initials like Telegram
                  getInitials(conversation.name)
                )}
              </div>
            )}
            {/* Online indicator only for private chats */}
            {!isGroup && conversation.online && (
              <div style={{
                position: 'absolute',
                bottom: '0',
                right: '0',
                width: '10px',
                height: '10px',
                background: 'var(--success)',
                border: '2px solid var(--bg-secondary)',
                borderRadius: 'var(--radius-full)',
              }} />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{
                fontSize: 'var(--title-sm)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--text-primary)',
              }}>
                {conversation.name}
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
              }}>
                {isGroup
                  ? conversation.memberCount
                    ? `${conversation.memberCount} members`
                    : 'Group'
                  : conversation.online ? 'Online' : 'Last seen recently'}
              </span>
            </div>
            {/* Tags */}
            <TagSelector
              conversationId={conversation.id}
              onTagsChange={(tags) => onTagsChange?.(conversation.id, tags)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <IconButton title="More Options">
            <MoreIcon style={{ width: '18px', height: '18px' }} />
          </IconButton>
        </div>
      </div>

      {/* AI Summary */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--bg-primary)',
      }}>
        <ConversationSummary
          conversationId={conversation.id}
          defaultExpanded={false}
        />
      </div>

      {/* Messages - with smooth animations */}
      <style>{`
        @keyframes messageSlideIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .message-animated {
          animation: messageSlideIn 150ms ease-out forwards;
        }
        @keyframes messagePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.3); }
          50% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
        }
        .message-highlighted {
          animation: messagePulse 1s ease-in-out 2;
        }
      `}</style>
      <div
        ref={messagesContainerRef}
        style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}>
        {/* Load more trigger at TOP for older messages */}
        {hasMore && (
          <div ref={loadMoreTriggerRef} style={{ padding: '8px 0', textAlign: 'center' }}>
            {isLoadingMore ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <LoadingSpinner size={14} />
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Loading older messages...</span>
              </div>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>Scroll up for older messages</span>
            )}
          </div>
        )}
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-4) 0',
            }}>
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-quaternary)',
                background: 'var(--bg-primary)',
                padding: 'var(--space-1) var(--space-3)',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--border-subtle)',
              }}>
                {formatDate(group.date)}
              </span>
            </div>

            {/* Messages for this date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {group.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isGroup={isGroup}
                  isHighlighted={message.id === highlightMessageId}
                  onRef={(el) => {
                    if (el) {
                      messageRefs.current.set(message.id, el);
                    } else {
                      messageRefs.current.delete(message.id);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: 'var(--space-4)',
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
          conversationId={conversation.id}
        />
      </div>
    </div>
  );
}

interface MessageInputWrapperProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onSendWithAttachment?: (text: string, attachment: { type: string; url: string; filename?: string; mimeType: string }) => void;
  conversationId?: string;
}

function MessageInputWrapper({ textareaRef, inputValue, onInputChange, onKeyDown, onSend, onSendWithAttachment, conversationId }: MessageInputWrapperProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachedFile, setAttachedFile] = useState<{ file: File; type: string; preview?: string; isImage?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 100x RELIABLE: AbortController for cancellable uploads
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    const isImage = file.type.startsWith('image/');

    // Determine type - images default to 'document' for filename preservation
    // User can toggle to 'photo' for inline preview
    let type = 'document';
    if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';
    // Note: Images start as 'document' by default, can be toggled to 'photo'

    // Create preview for images
    let preview: string | undefined;
    if (isImage) {
      preview = URL.createObjectURL(file);
    }

    setAttachedFile({ file, type, preview, isImage });

    // Clear input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = () => {
    // 100x RELIABLE: Cancel any in-progress upload when file is removed
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsUploading(false);
      setUploadProgress(0);
    }
    if (attachedFile?.preview) {
      URL.revokeObjectURL(attachedFile.preview);
    }
    setAttachedFile(null);
  };

  const handleSendWithFile = async () => {
    if (!attachedFile || !conversationId) return;

    // 100x RELIABLE: Create AbortController for cancellable upload
    abortControllerRef.current = new AbortController();
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Upload file with progress tracking using XMLHttpRequest
      const formData = new FormData();
      formData.append('file', attachedFile.file);

      const uploadData = await new Promise<{ success: boolean; file: { id: string; filename: string; mimeType: string; size: number; storageKey: string; type: string } }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.onabort = () => reject(new Error('Upload cancelled'));

        // 100x RELIABLE: Handle abort signal
        abortControllerRef.current?.signal.addEventListener('abort', () => {
          xhr.abort();
        });

        xhr.open('POST', '/api/upload');
        xhr.send(formData);
      });

      // Check if cancelled during upload
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // Send message with attachment
      // Use the type from the upload response (respects sendAs choice)
      // TELEGRAM LOGIC:
      // - For 'photo' type: DON'T send filename → sync worker sends as inline photo
      // - For 'document' type: SEND filename → sync worker preserves it
      if (onSendWithAttachment) {
        const shouldIncludeFilename = uploadData.file.type !== 'photo';
        onSendWithAttachment(inputValue, {
          type: uploadData.file.type,
          url: uploadData.file.storageKey,
          filename: shouldIncludeFilename ? uploadData.file.filename : undefined,
          mimeType: uploadData.file.mimeType,
        });
      }

      // Clear state
      if (attachedFile?.preview) {
        URL.revokeObjectURL(attachedFile.preview);
      }
      setAttachedFile(null);
    } catch (error) {
      // Don't show error if cancelled
      if (error instanceof Error && error.message === 'Upload cancelled') {
        return;
      }
      console.error('Failed to upload file:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      abortControllerRef.current = null;
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSendClick = () => {
    if (attachedFile) {
      handleSendWithFile();
    } else {
      onSend();
    }
  };

  const canSend = (inputValue.trim() || attachedFile) && !isUploading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* Attachment preview with progress and cancel */}
      {attachedFile && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2)',
          background: 'var(--bg-hover)',
          borderRadius: 'var(--radius-md)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Upload progress bar */}
          {isUploading && (
            <div style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              height: '3px',
              width: `${uploadProgress}%`,
              background: 'var(--accent-primary)',
              transition: 'width 100ms ease',
            }} />
          )}
          {attachedFile.preview ? (
            <div style={{ position: 'relative' }}>
              <img
                src={attachedFile.preview}
                alt="Preview"
                style={{
                  width: '48px',
                  height: '48px',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-sm)',
                  opacity: isUploading ? 0.6 : 1,
                }}
              />
              {isUploading && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <span style={{ color: 'white', fontSize: '12px', fontWeight: 600 }}>
                    {uploadProgress}%
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              position: 'relative',
            }}>
              <AttachmentIcon style={{ width: '20px', height: '20px', color: 'var(--text-secondary)' }} />
              {isUploading && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <span style={{ color: 'white', fontSize: '12px', fontWeight: 600 }}>
                    {uploadProgress}%
                  </span>
                </div>
              )}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attachedFile.file.name}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              {isUploading
                ? `Uploading... ${uploadProgress}%`
                : attachedFile.file.size >= 1024 * 1024
                  ? `${(attachedFile.file.size / (1024 * 1024)).toFixed(1)} MB`
                  : `${(attachedFile.file.size / 1024).toFixed(1)} KB`
              }
            </div>
          </div>
          <button
            onClick={handleRemoveAttachment}
            title={isUploading ? 'Cancel upload' : 'Remove attachment'}
            style={{
              padding: 'var(--space-1)',
              background: isUploading ? 'var(--error)' : 'none',
              border: 'none',
              borderRadius: isUploading ? 'var(--radius-sm)' : 0,
              cursor: 'pointer',
              color: isUploading ? 'white' : 'var(--text-tertiary)',
              fontWeight: isUploading ? 600 : 400,
              fontSize: isUploading ? '12px' : '16px',
              minWidth: isUploading ? '60px' : 'auto',
            }}
          >
            {isUploading ? 'Cancel' : '×'}
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-3)',
          background: 'var(--bg-tertiary)',
          border: `1px solid ${isFocused ? 'var(--accent-primary)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-2) var(--space-3)',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
          boxShadow: isFocused ? '0 0 0 2px var(--accent-subtle)' : 'none',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
        />
        <IconButton title="Attach File" onClick={handleAttachClick}>
          <AttachmentIcon style={{ width: '18px', height: '18px' }} />
        </IconButton>

        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={onInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendClick();
            } else {
              onKeyDown(e);
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={attachedFile ? "Add a caption..." : "Type a message..."}
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-md)',
            color: 'var(--text-primary)',
            resize: 'none',
            minHeight: '24px',
            maxHeight: '120px',
            lineHeight: '1.5',
          }}
          className="placeholder:text-[var(--text-quaternary)]"
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <IconButton title="Emoji">
            <EmojiIcon style={{ width: '18px', height: '18px' }} />
          </IconButton>
          <SendButton onClick={handleSendClick} disabled={!canSend} loading={isUploading} />
        </div>
      </div>
    </div>
  );
}

interface SendButtonProps {
  onClick: () => void;
  disabled: boolean;
  loading?: boolean;
}

function SendButton({ onClick, disabled, loading }: SendButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={loading ? "Uploading..." : "Send Message"}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        transition: 'all 150ms ease',
        background: (disabled || loading)
          ? 'var(--bg-hover)'
          : isHovered
          ? 'var(--accent-hover)'
          : 'var(--accent-primary)',
        color: (disabled || loading) ? 'var(--text-quaternary)' : 'white',
      }}
    >
      {loading ? (
        <div
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      ) : (
        <SendIcon style={{ width: '18px', height: '18px' }} />
      )}
    </button>
  );
}

// Loading spinner for infinite scroll
function LoadingSpinner({ size = 16 }: { size?: number }) {
  return (
    <>
      <style>{`
        @keyframes spinLoader {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        style={{ animation: 'spinLoader 0.8s linear infinite' }}
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

interface IconButtonProps {
  children: React.ReactNode;
  title?: string;
  onClick?: () => void;
}

function IconButton({ children, title, onClick }: IconButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isHovered ? 'var(--bg-hover)' : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        color: isHovered ? 'var(--text-primary)' : 'var(--text-tertiary)',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      {children}
    </button>
  );
}

interface MessageBubbleProps {
  message: Message;
  isGroup: boolean;
  isHighlighted?: boolean;
  onRef?: (el: HTMLDivElement | null) => void;
}

function MessageBubble({ message, isGroup, isHighlighted, onRef }: MessageBubbleProps) {
  const [imageError, setImageError] = useState(false);
  const isSent = message.sent;
  const text = message.text;
  const hasMedia = message.media && message.media.length > 0;
  const hasSender = isGroup && message.sender && !isSent;

  // Dynamic sizing based on message length - like WhatsApp/Telegram
  // Short messages: compact width
  // Long messages: wider, up to 70%
  const isShortMessage = !hasMedia && text.length < 30;
  const isMediumMessage = !hasMedia && text.length >= 30 && text.length < 100;

  // Calculate approximate width based on content
  const getMaxWidth = () => {
    if (hasMedia) return '70%';
    if (isShortMessage) return 'fit-content';
    if (isMediumMessage) return '50%';
    return '70%';
  };

  // Generate a consistent color for sender name based on their ID (like Telegram)
  const getSenderColor = (senderId: string) => {
    const colors = [
      '#E17076', '#FAA774', '#A695E7', '#7BC862',
      '#6EC9CB', '#65AADD', '#EE7AAE', '#F8B500',
    ];
    let hash = 0;
    for (let i = 0; i < senderId.length; i++) {
      hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Get sender initials for mini avatar
  const getSenderInitials = (name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div
      ref={onRef}
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        maxWidth: getMaxWidth(),
        alignSelf: isSent ? 'flex-end' : 'flex-start',
        marginLeft: isSent ? 'auto' : '0',
        marginRight: isSent ? '0' : 'auto',
        // Highlight animation for search results
        padding: isHighlighted ? '8px' : '0',
        margin: isHighlighted ? '-8px' : '0',
        marginBottom: isHighlighted ? 'calc(var(--space-0-5) - 8px)' : 'var(--space-0-5)',
        borderRadius: isHighlighted ? '12px' : '0',
        background: isHighlighted ? 'rgba(250, 204, 21, 0.15)' : 'transparent',
        boxShadow: isHighlighted ? '0 0 0 2px rgba(250, 204, 21, 0.4)' : 'none',
        transition: 'background 300ms ease, box-shadow 300ms ease',
      }}>
      {/* Mini avatar for group messages (Telegram/WhatsApp style) */}
      {hasSender && (
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: 'var(--radius-full)',
          background: getSenderColor(message.sender!.id),
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 'var(--font-semibold)',
          flexShrink: 0,
          marginTop: '2px',
        }}>
          {getSenderInitials(message.sender!.name)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{
          // Tighter padding: Linear-style minimal spacing
          padding: hasMedia ? '0' : (isShortMessage ? '6px 10px' : '8px 12px'),
          borderRadius: 'var(--radius-lg)',
          fontSize: 'var(--text-md)',
          lineHeight: '1.4',
          background: isSent ? 'var(--accent-primary)' : 'var(--bg-secondary)',
          color: isSent ? 'white' : 'var(--text-primary)',
          borderBottomRightRadius: isSent ? 'var(--radius-sm)' : 'var(--radius-lg)',
          borderBottomLeftRadius: isSent ? 'var(--radius-lg)' : 'var(--radius-sm)',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
        }}>
          {/* Sender name for group messages (compact, colored like Telegram) */}
          {hasSender && (
            <div style={{
              fontSize: '12px',
              fontWeight: 'var(--font-semibold)',
              color: getSenderColor(message.sender!.id),
              marginBottom: '2px',
              padding: hasMedia ? '8px 10px 0' : '0',
            }}>
              {message.sender!.name}
            </div>
          )}

        {/* Media attachments (images/documents) - 100x RELIABLE */}
        {hasMedia && message.media!.map((item, index) => {
          // Determine if this is an image that should be displayed inline
          // Check: type is photo/photos OR mimeType starts with image/
          const isImage = item.type === 'photos' || item.type === 'photo' ||
                          (item.mimeType && item.mimeType.startsWith('image/'));
          const isVideo = item.type === 'video' || item.type === 'videos' ||
                          (item.mimeType && item.mimeType.startsWith('video/'));
          const displayName = item.name || (isImage ? 'Photo' : isVideo ? 'Video' : 'Document');

          return (
            <div key={index} style={{ marginBottom: text ? 'var(--space-2)' : 0 }}>
              {isImage && !imageError ? (
                // INLINE IMAGE: Display image directly in chat bubble
                <img
                  src={item.url}
                  alt={displayName}
                  onError={() => setImageError(true)}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: text ? '0' : 'var(--radius-lg)',
                    display: 'block',
                  }}
                />
              ) : (
                // DOCUMENT/FILE: Show with filename and download link
                <a
                  href={item.url}
                  download={displayName}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3)',
                    background: isSent ? 'rgba(255,255,255,0.1)' : 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'background 150ms ease',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = isSent ? 'rgba(255,255,255,0.2)' : 'var(--bg-hover)'}
                  onMouseOut={(e) => e.currentTarget.style.background = isSent ? 'rgba(255,255,255,0.1)' : 'var(--bg-tertiary)'}
                >
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-md)',
                    background: isSent ? 'rgba(255,255,255,0.15)' : 'var(--accent-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <AttachmentIcon style={{ width: '20px', height: '20px', color: isSent ? 'rgba(255,255,255,0.9)' : 'var(--accent-primary)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 500,
                      color: isSent ? 'white' : 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {displayName}
                    </div>
                    <div style={{
                      fontSize: 'var(--text-xs)',
                      color: isSent ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)',
                    }}>
                      {isVideo ? 'Video' : 'Document'} • Click to download
                    </div>
                  </div>
                  <DownloadIcon style={{ width: '16px', height: '16px', color: isSent ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)' }} />
                </a>
              )}
            </div>
          );
        })}

        {/* Show placeholder for messages with hasAttachments but no media data (not yet downloaded) */}
        {!hasMedia && message.contentType === 'media' && (
          <div style={{
            padding: 'var(--space-3)',
            background: isSent ? 'rgba(255,255,255,0.1)' : 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}>
            <AttachmentIcon style={{ width: '20px', height: '20px', color: isSent ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', color: isSent ? 'rgba(255,255,255,0.9)' : 'var(--text-secondary)' }}>
              Media attachment
            </span>
          </div>
        )}

        {/* Text content */}
        {text && (
          <div style={{ padding: hasMedia ? '6px 10px 8px' : '0' }}>
            {text}
          </div>
        )}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
          marginTop: '2px',
          flexDirection: isSent ? 'row-reverse' : 'row',
        }}>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-quaternary)',
          }}>
            {formatMessageTime(message.time)}
          </span>
          {isSent && <MessageStatus message={message} />}
        </div>
      </div>
    </div>
  );
}

function MessageStatus({ message }: { message: Message }) {
  if (message.readAt) {
    return <DoubleCheckIcon style={{ width: '16px', height: '16px', color: '#34B7F1' }} />;
  }

  if (message.deliveredAt) {
    return <DoubleCheckIcon style={{ width: '16px', height: '16px', color: 'var(--text-quaternary)' }} />;
  }

  if (message.status === 'sent' || message.time) {
    return <SingleCheckIcon style={{ width: '16px', height: '16px', color: 'var(--text-quaternary)' }} />;
  }

  return <ClockIcon style={{ width: '14px', height: '14px', color: 'var(--text-quaternary)' }} />;
}

interface MessageGroup {
  date: string;
  messages: Message[];
}

function groupMessagesByDate(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentDate = '';
  let currentMessages: Message[] = [];

  for (const message of messages) {
    const messageDate = new Date(message.time).toDateString();

    if (messageDate !== currentDate) {
      if (currentMessages.length > 0) {
        groups.push({ date: currentDate, messages: currentMessages });
      }
      currentDate = messageDate;
      currentMessages = [message];
    } else {
      currentMessages.push(message);
    }
  }

  if (currentMessages.length > 0) {
    groups.push({ date: currentDate, messages: currentMessages });
  }

  return groups;
}

// Group icon (like Telegram's group chat icon)
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

