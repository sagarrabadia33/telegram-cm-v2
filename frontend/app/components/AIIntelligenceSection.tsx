'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDownIcon } from './Icons';

interface AIIntelligenceSectionProps {
  conversationId: string;
  aiSummary: string | null;
  aiSuggestedAction: string | null;
  aiStatusReason: string | null;
  aiStatus: string | null;
  onDraftGenerated: (draft: string) => void;
}

interface NeedsReplyResponse {
  needsReply: boolean;
  reason: string;
  lastMessageDirection: string | null;
  conversationState: string;
}

type TonePreset = 'casual' | 'professional' | 'friendly' | 'brief';

const TONE_PRESETS: { id: TonePreset; label: string; description: string }[] = [
  { id: 'casual', label: 'Casual', description: 'Natural, relaxed' },
  { id: 'professional', label: 'Professional', description: 'Formal but warm' },
  { id: 'friendly', label: 'Friendly', description: 'Upbeat, positive' },
  { id: 'brief', label: 'Brief', description: 'Short and punchy' },
];

/**
 * AIIntelligenceSection - Unified AI context panel
 * Shows: Summary + Recommended Action (with Why) + Draft Reply
 *
 * Design: Compact, actionable, Linear-style
 */
export default function AIIntelligenceSection({
  conversationId,
  aiSummary,
  aiSuggestedAction,
  aiStatusReason,
  aiStatus,
  onDraftGenerated,
}: AIIntelligenceSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [selectedTone, setSelectedTone] = useState<TonePreset>('casual');
  const [error, setError] = useState<string | null>(null);
  const [needsReply, setNeedsReply] = useState<NeedsReplyResponse | null>(null);
  const [isCheckingReply, setIsCheckingReply] = useState(true);

  // Check if reply is needed
  const checkNeedsReply = useCallback(async () => {
    if (!conversationId) return;

    try {
      setIsCheckingReply(true);
      const res = await fetch(`/api/conversations/${conversationId}/needs-reply`);
      if (!res.ok) throw new Error('Failed to check needs-reply');
      const data: NeedsReplyResponse = await res.json();
      setNeedsReply(data);
    } catch (err) {
      console.error('Error checking needs-reply:', err);
      setNeedsReply({ needsReply: false, reason: 'Error checking', lastMessageDirection: null, conversationState: 'unknown' });
    } finally {
      setIsCheckingReply(false);
    }
  }, [conversationId]);

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
      setError(message.slice(0, 100));
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle main button click
  const handleMainClick = () => {
    if (isGenerating) return;
    generateDraft(selectedTone);
  };

  // Handle tone selection
  const handleToneSelect = (tone: TonePreset) => {
    setSelectedTone(tone);
    generateDraft(tone);
  };

  // Don't show if no AI data at all
  const hasAnyContent = aiSummary || aiSuggestedAction || aiStatusReason;
  if (!hasAnyContent && !needsReply?.needsReply) {
    return null;
  }

  // Extract clean "why" from status reason (remove [Xd waiting] prefix if present)
  const cleanReason = aiStatusReason?.replace(/^\[\d+d waiting\]\s*/, '').trim() || null;

  return (
    <div style={{
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)',
    }}>
      {/* Compact Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '6px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <AISparkleIcon />
          <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            AI
          </span>
        </div>
        <ChevronDownIcon style={{
          width: '12px',
          height: '12px',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 150ms ease',
        }} />
      </button>

      {/* Expanded Content - Ultra Compact */}
      {isExpanded && (
        <div style={{ padding: '0 12px 10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Summary - Single line if possible */}
          {aiSummary && (
            <div style={{
              fontSize: '11px',
              lineHeight: '1.4',
              color: 'var(--text-secondary)',
              padding: '6px 8px',
              background: 'var(--bg-primary)',
              borderRadius: '4px',
              borderLeft: '2px solid var(--border-default)',
            }}>
              {aiSummary}
            </div>
          )}

          {/* Next Step + Why - Combined compact block */}
          {aiSuggestedAction && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.06)',
              borderRadius: '6px',
              padding: '8px 10px',
              border: '1px solid rgba(59, 130, 246, 0.12)',
            }}>
              {/* Action */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <LightbulbIcon />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    lineHeight: '1.35',
                    color: 'var(--text-primary)',
                  }}>
                    {aiSuggestedAction}
                  </div>
                  {/* Why - inline subtle */}
                  {cleanReason && (
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-quaternary)',
                      marginTop: '4px',
                      lineHeight: '1.35',
                    }}>
                      {cleanReason}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Draft Reply Button - Compact */}
          {(needsReply?.needsReply || aiSuggestedAction) && !isCheckingReply && (
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* Main Draft Button */}
                <button
                  onClick={handleMainClick}
                  disabled={isGenerating}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    padding: '6px 10px',
                    background: isGenerating ? 'var(--bg-hover)' : 'var(--accent-primary)',
                    color: isGenerating ? 'var(--text-tertiary)' : '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '11px',
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

                {/* Tone Dropdown */}
                <button
                  onClick={() => setShowToneMenu(!showToneMenu)}
                  disabled={isGenerating}
                  style={{
                    padding: '6px',
                    background: showToneMenu ? 'var(--bg-hover)' : 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '5px',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Change tone"
                >
                  <ChevronDownIcon style={{
                    width: '12px',
                    height: '12px',
                    transform: showToneMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms ease',
                  }} />
                </button>
              </div>

              {/* Tone Menu */}
              {showToneMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '5px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  zIndex: 10,
                  minWidth: '140px',
                  overflow: 'hidden',
                }}>
                  {TONE_PRESETS.map((tone) => (
                    <button
                      key={tone.id}
                      onClick={() => handleToneSelect(tone.id)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: selectedTone === tone.id ? 'var(--bg-hover)' : 'transparent',
                        border: 'none',
                        borderLeft: selectedTone === tone.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}>
                        {tone.label}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                      }}>
                        {tone.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  marginTop: '4px',
                  fontSize: '11px',
                  color: 'var(--error)',
                }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Icons
function AISparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

function DraftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

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
