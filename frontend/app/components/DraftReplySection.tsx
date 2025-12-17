'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDownIcon } from './Icons';

interface NeedsReplyResponse {
  needsReply: boolean;
  reason: string;
  lastMessageDirection: string | null;
  conversationState: string;
  hasQuestion?: boolean;
  lastMessagePreview?: string | null;
  aiSuggestedAction?: string | null;
  aiStatus?: string | null;
}

interface DraftResponse {
  draft: string;
  tone: string;
  conversationId: string;
  usedToneProfile: boolean;
  toneProfileId?: string | null;
}

interface DraftReplySectionProps {
  conversationId: string;
  onDraftGenerated: (draft: string) => void;
}

type TonePreset = 'casual' | 'professional' | 'friendly' | 'brief';

const TONE_PRESETS: { id: TonePreset; label: string; description: string }[] = [
  { id: 'casual', label: 'Casual', description: 'Natural, relaxed style' },
  { id: 'professional', label: 'Professional', description: 'Formal but warm' },
  { id: 'friendly', label: 'Friendly', description: 'Upbeat, positive' },
  { id: 'brief', label: 'Brief', description: 'Short and punchy' },
];

/**
 * DraftReplySection - Smart draft reply button with tone presets
 *
 * Features:
 * - Only shows when reply is needed (smart detection)
 * - Generates draft that matches Shalin's writing style
 * - Tone presets (Professional, Friendly, Brief)
 * - Loading state with shimmer
 */
export default function DraftReplySection({
  conversationId,
  onDraftGenerated,
}: DraftReplySectionProps) {
  const [needsReply, setNeedsReply] = useState<NeedsReplyResponse | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [selectedTone, setSelectedTone] = useState<TonePreset>('casual');
  const [error, setError] = useState<string | null>(null);

  // Check if reply is needed
  const checkNeedsReply = useCallback(async () => {
    if (!conversationId) return;

    try {
      setIsChecking(true);
      const res = await fetch(`/api/conversations/${conversationId}/needs-reply`);
      if (!res.ok) throw new Error('Failed to check needs-reply');
      const data: NeedsReplyResponse = await res.json();
      setNeedsReply(data);
    } catch (err) {
      console.error('Error checking needs-reply:', err);
      setNeedsReply({ needsReply: false, reason: 'Error checking', lastMessageDirection: null, conversationState: 'unknown' });
    } finally {
      setIsChecking(false);
    }
  }, [conversationId]);

  // Check on mount and when conversationId changes
  useEffect(() => {
    checkNeedsReply();
  }, [checkNeedsReply]);

  // Generate draft with selected tone
  const generateDraft = async (tone: TonePreset) => {
    if (!conversationId) return;

    try {
      setIsGenerating(true);
      setError(null);
      setShowToneMenu(false);

      const res = await fetch(`/api/inbox-zero/draft/${conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Draft API error:', data);
        throw new Error(data.details || data.error || 'Failed to generate draft');
      }

      if (data.draft && data.draft !== '[NO_REPLY_NEEDED]') {
        onDraftGenerated(data.draft);
      } else {
        setError('No reply needed');
      }
    } catch (err) {
      console.error('Error generating draft:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate';
      setError(message.slice(0, 100)); // Truncate long errors
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle main button click (use default tone)
  const handleMainClick = () => {
    if (isGenerating) return;
    generateDraft(selectedTone);
  };

  // Handle tone selection from dropdown
  const handleToneSelect = (tone: TonePreset) => {
    setSelectedTone(tone);
    generateDraft(tone);
  };

  // Don't show if still checking
  if (isChecking) {
    return null;
  }

  // Don't show if no reply needed
  if (!needsReply?.needsReply) {
    return null;
  }

  return (
    <div style={{
      padding: 'var(--space-2) var(--space-3)',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {/* Draft button with dropdown */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {/* Main button */}
          <button
            onClick={handleMainClick}
            disabled={isGenerating}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              background: isGenerating ? 'var(--bg-hover)' : 'var(--accent-subtle)',
              color: isGenerating ? 'var(--text-tertiary)' : 'var(--accent-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: isGenerating ? 'wait' : 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            {isGenerating ? (
              <>
                <LoadingSpinner />
                <span>Drafting...</span>
              </>
            ) : (
              <>
                <DraftIcon />
                <span>Draft Reply</span>
              </>
            )}
          </button>

          {/* Tone dropdown toggle */}
          <button
            onClick={() => setShowToneMenu(!showToneMenu)}
            disabled={isGenerating}
            style={{
              padding: 'var(--space-2)',
              background: showToneMenu ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 150ms ease',
            }}
            title="Change tone"
          >
            <ChevronDownIcon style={{
              width: '16px',
              height: '16px',
              transform: showToneMenu ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
            }} />
          </button>
        </div>

        {/* Tone preset dropdown */}
        {showToneMenu && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 'var(--space-1)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            zIndex: 10,
            minWidth: '180px',
            overflow: 'hidden',
          }}>
            {TONE_PRESETS.map((tone) => (
              <button
                key={tone.id}
                onClick={() => handleToneSelect(tone.id)}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  background: selectedTone === tone.id ? 'var(--bg-hover)' : 'transparent',
                  border: 'none',
                  borderLeft: selectedTone === tone.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 100ms ease',
                }}
              >
                <div style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}>
                  {tone.label}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                }}>
                  {tone.description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          marginTop: 'var(--space-1)',
          fontSize: '11px',
          color: 'var(--error)',
        }}>
          {error}
        </div>
      )}

      {/* Context hint */}
      {!isGenerating && needsReply.reason && (
        <div style={{
          marginTop: 'var(--space-1)',
          fontSize: '10px',
          color: 'var(--text-quaternary)',
        }}>
          {needsReply.reason}
        </div>
      )}
    </div>
  );
}

// Small loading spinner
function LoadingSpinner() {
  return (
    <div style={{
      width: '14px',
      height: '14px',
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}

// Draft icon
function DraftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
