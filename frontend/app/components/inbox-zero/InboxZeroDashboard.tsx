'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProgressHeader } from './ProgressHeader';
import { TriageSection } from './TriageSection';
import { ClearSection } from './ClearSection';
import { CommitmentsPanel } from './CommitmentsPanel';
import { TagSuggestionCard } from './TagSuggestionCard';
import { AllCaughtUpState } from './AllCaughtUpState';

export interface TriagedConversation {
  id: string;
  title: string;
  avatarUrl: string | null;
  type: string;
  unreadCount: number;
  lastMessage: {
    body: string | null;
    direction: string;
    sentAt: string;
  } | null;
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  triage: {
    bucket: string;
    reason: string | null;
    priorityScore: number;
    draftReply: string | null;
    draftTone: string | null;
    isDirectMention: boolean;
    isQuestion: boolean;
    hasOverduePromise: boolean;
    isComplaint: boolean;
    conversationState?: 'waiting_on_them' | 'waiting_on_you' | 'concluded' | 'ongoing';
    suggestedAction?: 'reply' | 'follow_up' | 'wait' | 'close' | null;
  } | null;
  memberCount?: number;
}

export interface Commitment {
  id: string;
  content: string;
  dueDate: string | null;
  conversationId: string;
  contactName: string;
}

export interface TagSuggestion {
  id: string;
  conversationId: string;
  contactName: string;
  suggestedTag: {
    id: string;
    name: string;
    color: string | null;
  };
  reason: string;
  confidence: number;
}

interface InboxZeroData {
  buckets: {
    respond: TriagedConversation[];
    review: TriagedConversation[];
    clear: {
      count: number;
      groups: Array<{ id: string; name: string; count: number }>;
    };
  };
  progress: {
    total: number;
    completed: number;
    percentage: number;
  };
  commitments: {
    overdue: Commitment[];
    dueToday: Commitment[];
    upcoming: Commitment[];
  };
  tagSuggestions: TagSuggestion[];
  lastTriagedAt: string | null;
}

interface InboxZeroDashboardProps {
  onOpenConversation: (conversationId: string) => void;
}

function formatDate(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function InboxZeroDashboard({ onOpenConversation }: InboxZeroDashboardProps) {
  const [data, setData] = useState<InboxZeroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTriaging, setIsTriaging] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/inbox-zero');
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load inbox data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // R = Refresh
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleTriage();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTriage = async () => {
    setIsTriaging(true);
    try {
      await fetch('/api/inbox-zero/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh: true }),
      });
      await fetchData();
    } catch (err) {
      console.error('Triage failed:', err);
    } finally {
      setIsTriaging(false);
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch('/api/inbox-zero/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      await fetchData();
    } catch (err) {
      console.error('Clear failed:', err);
    }
  };

  const handleMarkAsActioned = async (conversationId: string) => {
    try {
      await fetch('/api/inbox-zero/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationIds: [conversationId] }),
      });
      await fetchData();
    } catch (err) {
      console.error('Action failed:', err);
    }
  };

  const handleAcceptSuggestion = async (suggestionId: string) => {
    try {
      await fetch(`/api/inbox-zero/suggestions/${suggestionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      });
      await fetchData();
    } catch (err) {
      console.error('Accept suggestion failed:', err);
    }
  };

  const handleRejectSuggestion = async (suggestionId: string) => {
    try {
      await fetch(`/api/inbox-zero/suggestions/${suggestionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      await fetchData();
    } catch (err) {
      console.error('Reject suggestion failed:', err);
    }
  };

  const handleCompleteCommitment = async (commitmentId: string) => {
    try {
      await fetch(`/api/inbox-zero/commitments/${commitmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      await fetchData();
    } catch (err) {
      console.error('Complete commitment failed:', err);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ animation: 'spin 1s linear infinite' }}
          >
            <circle cx="8" cy="8" r="6" stroke="var(--border-default)" strokeWidth="2" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading inbox...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
      }}>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>{error || 'Something went wrong'}</span>
        <button
          onClick={fetchData}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const totalItems = data.buckets.respond.length + data.buckets.review.length + data.buckets.clear.count;
  const totalUnread = data.buckets.respond.reduce((sum, c) => sum + c.unreadCount, 0) +
                      data.buckets.review.reduce((sum, c) => sum + c.unreadCount, 0) +
                      data.buckets.clear.count;
  const isAllCaughtUp = totalItems === 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}>
          <div>
            <p style={{
              fontSize: '11px',
              color: 'var(--text-quaternary)',
              marginBottom: '2px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {formatDate()}
            </p>
            <h1 style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}>
              {getGreeting()}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Last updated indicator */}
            {lastUpdated && (
              <span style={{
                fontSize: '10px',
                color: 'var(--text-quaternary)',
              }}>
                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleTriage}
              disabled={isTriaging}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 500,
                color: isTriaging ? 'var(--text-quaternary)' : 'var(--text-tertiary)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                cursor: isTriaging ? 'default' : 'pointer',
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                style={{ animation: isTriaging ? 'spin 1s linear infinite' : 'none' }}
              >
                <path
                  d="M14 8A6 6 0 1 1 8 2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {isTriaging ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </div>
      </header>

      {/* Progress */}
      <ProgressHeader
        respondCount={data.buckets.respond.length}
        reviewCount={data.buckets.review.length}
        clearCount={data.buckets.clear.count}
        totalUnread={totalUnread}
        completedCount={data.progress.completed}
        percentage={data.progress.percentage}
      />

      {/* Main content */}
      {isAllCaughtUp ? (
        <AllCaughtUpState completedToday={data.progress.completed} />
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{
            display: 'flex',
            gap: '40px',
            padding: '20px',
            maxWidth: '1120px',
            margin: '0 auto',
          }}>
            {/* Main column */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Respond section */}
              {data.buckets.respond.length > 0 && (
                <TriageSection
                  bucket="respond"
                  title="Needs reply"
                  subtitle="People waiting on you"
                  conversations={data.buckets.respond}
                  onOpenConversation={onOpenConversation}
                  onMarkAsActioned={handleMarkAsActioned}
                  onRefreshData={fetchData}
                />
              )}

              {/* Review section */}
              {data.buckets.review.length > 0 && (
                <div style={{ marginTop: data.buckets.respond.length > 0 ? '28px' : 0 }}>
                  <TriageSection
                    bucket="review"
                    title="To review"
                    subtitle="Good to know, no reply needed"
                    conversations={data.buckets.review}
                    onOpenConversation={onOpenConversation}
                    onMarkAsActioned={handleMarkAsActioned}
                    onRefreshData={fetchData}
                  />
                </div>
              )}

              {/* Clear section */}
              {data.buckets.clear.count > 0 && (
                <div style={{ marginTop: '28px' }}>
                  <ClearSection
                    count={data.buckets.clear.count}
                    groups={data.buckets.clear.groups}
                    onClearAll={handleClearAll}
                  />
                </div>
              )}

              {/* Empty main column state */}
              {data.buckets.respond.length === 0 && data.buckets.review.length === 0 && data.buckets.clear.count === 0 && (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                    No messages need attention
                  </p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside style={{ width: '260px', flexShrink: 0 }}>
              {/* Commitments */}
              <CommitmentsPanel
                commitments={data.commitments}
                onComplete={handleCompleteCommitment}
                onOpenConversation={onOpenConversation}
              />

              {/* Suggestions */}
              {data.tagSuggestions.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h3 style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--text-quaternary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '10px',
                  }}>
                    AI Suggestions
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {data.tagSuggestions.slice(0, 3).map(suggestion => (
                      <TagSuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        onAccept={() => handleAcceptSuggestion(suggestion.id)}
                        onReject={() => handleRejectSuggestion(suggestion.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Keyboard shortcuts hint */}
              <div style={{
                marginTop: '24px',
                padding: '10px',
                background: 'var(--bg-secondary)',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
              }}>
                <p style={{
                  fontSize: '10px',
                  color: 'var(--text-quaternary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '6px',
                }}>
                  Keyboard shortcuts
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Refresh & analyze</span>
                    <kbd style={{
                      padding: '1px 4px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '3px',
                      fontSize: '10px',
                      color: 'var(--text-quaternary)',
                    }}>R</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Send reply</span>
                    <span style={{ display: 'flex', gap: '2px' }}>
                      <kbd style={{
                        padding: '1px 4px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '3px',
                        fontSize: '10px',
                        color: 'var(--text-quaternary)',
                      }}>⌘</kbd>
                      <kbd style={{
                        padding: '1px 4px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '3px',
                        fontSize: '10px',
                        color: 'var(--text-quaternary)',
                      }}>↵</kbd>
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
