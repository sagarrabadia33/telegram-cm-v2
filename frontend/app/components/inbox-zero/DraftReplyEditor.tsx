'use client';

import { useState, useRef, useEffect } from 'react';
import { ToneSelector } from './ToneSelector';

type DraftTone = 'casual' | 'professional' | 'warm' | 'empathetic';

interface DraftReplyEditorProps {
  conversationId: string;
  initialDraft: string;
  initialTone: DraftTone;
  onSend: (text: string) => void;
  onDismiss: () => void;
  onOpen: () => void;
  onRefreshData: () => void;
}

export function DraftReplyEditor({
  conversationId,
  initialDraft,
  initialTone,
  onSend,
  onDismiss,
  onOpen,
  onRefreshData,
}: DraftReplyEditorProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [tone, setTone] = useState<DraftTone>(initialTone);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [noReplyNeeded, setNoReplyNeeded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [draft]);

  // Generate draft on mount if no initial draft
  useEffect(() => {
    if (!initialDraft) {
      generateDraft(tone);
    }
  }, []);

  const generateDraft = async (selectedTone: DraftTone) => {
    setIsGenerating(true);
    setNoReplyNeeded(false);
    try {
      const response = await fetch(`/api/inbox-zero/draft/${conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: selectedTone }),
      });
      const data = await response.json();
      if (data.draft) {
        // Check if AI determined no reply is needed
        if (data.draft === '[NO_REPLY_NEEDED]' || data.draft.includes('[NO_REPLY_NEEDED]')) {
          setNoReplyNeeded(true);
          setDraft('');
        } else {
          setDraft(data.draft);
        }
      }
    } catch (err) {
      console.error('Failed to generate draft:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToneChange = (newTone: DraftTone) => {
    setTone(newTone);
    generateDraft(newTone);
  };

  const handleSend = async () => {
    if (!draft.trim() || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft }),
      });

      if (response.ok) {
        onSend(draft);
      } else {
        console.error('Failed to send message');
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Handle Cmd+Enter to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <ToneSelector value={tone} onChange={handleToneChange} />
        <button
          onClick={() => generateDraft(tone)}
          disabled={isGenerating}
          style={{
            padding: '4px',
            color: 'var(--text-tertiary)',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: isGenerating ? 'default' : 'pointer',
            opacity: isGenerating ? 0.5 : 1,
          }}
          title="Regenerate draft"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            style={{
              animation: isGenerating ? 'spin 1s linear infinite' : 'none',
            }}
          >
            <path
              d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      {/* Textarea */}
      {isGenerating ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Analyzing conversation...
          </span>
        </div>
      ) : noReplyNeeded ? (
        <div
          style={{
            padding: '16px',
            background: 'var(--success)10',
            border: '1px solid var(--success)30',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '8px',
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"
                fill="var(--success)"
              />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--success)' }}>
              No reply needed
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
            This conversation is concluded or waiting on their response.
          </p>
          <button
            onClick={() => {
              setNoReplyNeeded(false);
              setDraft('');
            }}
            style={{
              marginTop: '10px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-tertiary)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            Write reply anyway
          </button>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your reply..."
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '13px',
            lineHeight: 1.5,
            color: 'var(--text-primary)',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            resize: 'none',
            minHeight: '80px',
            outline: 'none',
          }}
          rows={3}
        />
      )}

      {/* Character count */}
      {draft && !isGenerating && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-quaternary)',
          textAlign: 'right',
          fontFeatureSettings: '"tnum"',
        }}>
          {draft.length} characters
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={onDismiss}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-tertiary)',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
          <button
            onClick={onOpen}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-tertiary)',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Open
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path
                d="M6.5 3.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3M9.5 2.5h4m0 0v4m0-4l-6 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <button
          onClick={handleSend}
          disabled={!draft.trim() || isSending}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: !draft.trim() || isSending ? 'var(--text-quaternary)' : 'var(--text-primary)',
            background: !draft.trim() || isSending ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: !draft.trim() || isSending ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {isSending ? 'Sending...' : 'Send'}
          {!isSending && (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M1.5 8.5a.5.5 0 0 1 .5-.5h10.793L8.146 3.354a.5.5 0 1 1 .708-.708l5.5 5.5a.5.5 0 0 1 0 .708l-5.5 5.5a.5.5 0 0 1-.708-.708L12.793 9H2a.5.5 0 0 1-.5-.5z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Keyboard hint */}
      <div style={{
        fontSize: '10px',
        color: 'var(--text-quaternary)',
        textAlign: 'center',
      }}>
        <kbd style={{
          padding: '1px 4px',
          fontSize: '10px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '3px',
        }}>
          ⌘
        </kbd>
        {' + '}
        <kbd style={{
          padding: '1px 4px',
          fontSize: '10px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '3px',
        }}>
          Enter
        </kbd>
        {' to send'}
      </div>
    </div>
  );
}
