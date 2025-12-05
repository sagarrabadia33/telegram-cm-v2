"use client";

import { useState, useEffect, useCallback } from "react";

interface ConversationSummaryProps {
  conversationId: string;
  conversationTitle?: string;
  defaultExpanded?: boolean;
  refreshTrigger?: number; // Increment to trigger a refetch (e.g., after sync completes)
}

interface SummaryData {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  intentLevel: "high" | "medium" | "low";
  keyPoints: string[];
  lastTopic: string;
  summaryGeneratedAt: string;
  newMessagesSinceGenerated?: number;
}

export function ConversationSummary({
  conversationId,
  defaultExpanded = false,
  refreshTrigger = 0,
}: ConversationSummaryProps) {
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, [conversationId, refreshTrigger]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/conversations/${conversationId}/summary`);
      const data = await response.json();
      if (response.ok && data.success) {
        setSummaryData(data.data);
      } else {
        setSummaryData(null);
      }
    } catch (err) {
      console.error("Error fetching summary:", err);
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setRegenerating(true);
      setError(null);
      const response = await fetch(`/api/conversations/${conversationId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSummaryData(data.data);
        setIsExpanded(true);
      } else {
        setError(data.error || "Failed to generate");
      }
    } catch (err) {
      console.error("Error generating summary:", err);
      setError("Failed to generate");
    } finally {
      setRegenerating(false);
    }
  }, [conversationId]);

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  };

  const newMessages = summaryData?.newMessagesSinceGenerated || 0;
  const isOutdated = newMessages >= 5;

  // Loading skeleton - Linear shimmer style
  if (loading && !summaryData) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: 'var(--space-3) var(--space-4)',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <SkeletonBox width="20px" height="20px" borderRadius="var(--radius-md)" />
          <SkeletonLine width="100px" />
          <SkeletonLine width="60px" />
        </div>
      </div>
    );
  }

  // Empty state - no summary yet
  if (!summaryData) {
    return (
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          padding: 'var(--space-3) var(--space-4)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <AIGradientIcon />
            <span style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-medium)',
              color: 'var(--text-secondary)',
            }}>
              AI Summary
            </span>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-quaternary)',
            }}>
              Not generated
            </span>
          </div>
          <GenerateButton
            onClick={generateSummary}
            isLoading={regenerating}
            label="Generate"
          />
        </div>
        {error && <ErrorMessage message={error} />}
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      {/* Header - Always visible, clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-4)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Left: Icon + Title + Time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, flex: 1 }}>
          <AIGradientIcon />

          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-medium)',
            color: 'var(--text-primary)',
          }}>
            AI Summary
          </span>

          <span style={{
            fontSize: '11px',
            color: 'var(--text-quaternary)',
            fontFeatureSettings: '"tnum"',
          }}>
            {formatTimeAgo(summaryData.summaryGeneratedAt)}
          </span>

          {/* Inline sentiment + intent badges - visible in collapsed state */}
          {!isExpanded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)', marginLeft: 'var(--space-1)' }}>
              <MicroBadge
                label={summaryData.sentiment}
                variant={summaryData.sentiment === 'positive' ? 'success' : summaryData.sentiment === 'negative' ? 'error' : 'neutral'}
              />
              <MicroBadge
                label={summaryData.intentLevel}
                variant={summaryData.intentLevel === 'high' ? 'accent' : summaryData.intentLevel === 'medium' ? 'info' : 'neutral'}
              />
            </div>
          )}
        </div>

        {/* Right: Update button + Chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {/* New messages indicator with update action */}
          {newMessages > 0 ? (
            <UpdateBadge
              count={newMessages}
              isOutdated={isOutdated}
              isLoading={regenerating}
              onClick={generateSummary}
            />
          ) : (
            /* Refresh button - always rendered, opacity reveals on hover */
            <RefreshButton
              onClick={generateSummary}
              isLoading={regenerating}
              isVisible={isHovered}
            />
          )}

          <ChevronIcon expanded={isExpanded} />
        </div>
      </button>

      {/* Collapsed preview - one line summary */}
      {!isExpanded && (
        <div style={{
          padding: '0 var(--space-4) var(--space-3)',
          paddingLeft: 'calc(var(--space-4) + 20px + var(--space-3))', // Align with title
        }}>
          <p style={{
            fontSize: 'var(--text-sm)',
            lineHeight: '1.5',
            color: 'var(--text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            margin: 0,
          }}>
            {summaryData.summary}
          </p>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div style={{
          padding: '0 var(--space-4) var(--space-4)',
          paddingLeft: 'calc(var(--space-4) + 20px + var(--space-3))', // Align with title
        }}>
          {/* Full summary text */}
          <p style={{
            fontSize: 'var(--text-sm)',
            lineHeight: '1.6',
            color: 'var(--text-secondary)',
            margin: '0 0 var(--space-4) 0',
          }}>
            {summaryData.summary}
          </p>

          {/* Key insights grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: summaryData.keyPoints?.length > 0 ? '1fr 1fr' : '1fr',
            gap: 'var(--space-4)',
          }}>
            {/* Current Topic */}
            {summaryData.lastTopic && (
              <InsightSection
                icon={<TopicIcon />}
                label="Current Topic"
                color="var(--info)"
              >
                <p style={{
                  fontSize: 'var(--text-sm)',
                  lineHeight: '1.5',
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}>
                  {summaryData.lastTopic}
                </p>
              </InsightSection>
            )}

            {/* Key Points */}
            {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
              <InsightSection
                icon={<KeyPointsIcon />}
                label="Key Points"
                color="var(--success)"
              >
                <ul style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                }}>
                  {summaryData.keyPoints.slice(0, 3).map((point, i) => (
                    <li key={i} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--space-2)',
                      fontSize: 'var(--text-sm)',
                      lineHeight: '1.4',
                      color: 'var(--text-secondary)',
                    }}>
                      <span style={{
                        color: 'var(--text-quaternary)',
                        fontSize: '11px',
                        fontWeight: 'var(--font-medium)',
                        minWidth: '14px',
                      }}>
                        {i + 1}.
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </InsightSection>
            )}
          </div>

          {/* Footer: Status badges only - refresh action is in the header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-4)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            <StatusBadge
              label={`${summaryData.sentiment} sentiment`}
              variant={summaryData.sentiment === 'positive' ? 'success' : summaryData.sentiment === 'negative' ? 'error' : 'neutral'}
              icon={<SentimentIcon sentiment={summaryData.sentiment} />}
            />
            <StatusBadge
              label={`${summaryData.intentLevel} intent`}
              variant={summaryData.intentLevel === 'high' ? 'accent' : summaryData.intentLevel === 'medium' ? 'info' : 'neutral'}
              icon={<IntentIcon level={summaryData.intentLevel} />}
            />
          </div>

          {error && <ErrorMessage message={error} />}
        </div>
      )}
    </div>
  );
}

// ============================================
// Skeleton Components
// ============================================

function SkeletonBox({ width, height, borderRadius = 'var(--radius-sm)' }: { width: string; height: string; borderRadius?: string }) {
  return (
    <div style={{
      width,
      height,
      borderRadius,
      background: 'linear-gradient(90deg, var(--bg-tertiary) 0%, var(--bg-hover) 50%, var(--bg-tertiary) 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      flexShrink: 0,
    }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return <SkeletonBox width={width} height="12px" />;
}

// ============================================
// Insight Section
// ============================================

interface InsightSectionProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  children: React.ReactNode;
}

function InsightSection({ icon, label, color, children }: InsightSectionProps) {
  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1-5)',
        marginBottom: 'var(--space-2)',
      }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{
          fontSize: '10px',
          fontWeight: 'var(--font-semibold)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-quaternary)',
        }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

// ============================================
// Badges & Buttons
// ============================================

function MicroBadge({ label, variant }: { label: string; variant: 'success' | 'error' | 'neutral' | 'accent' | 'info' }) {
  const colors = {
    success: { bg: 'rgba(34, 197, 94, 0.12)', dot: '#22C55E' },
    error: { bg: 'rgba(239, 68, 68, 0.12)', dot: '#EF4444' },
    accent: { bg: 'var(--accent-subtle)', dot: 'var(--accent-primary)' },
    info: { bg: 'rgba(59, 130, 246, 0.12)', dot: '#3B82F6' },
    neutral: { bg: 'var(--bg-tertiary)', dot: 'var(--text-quaternary)' },
  };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 6px',
      fontSize: '10px',
      fontWeight: 'var(--font-medium)',
      textTransform: 'capitalize',
      borderRadius: 'var(--radius-sm)',
      background: colors[variant].bg,
      color: 'var(--text-tertiary)',
    }}>
      <span style={{
        width: '5px',
        height: '5px',
        borderRadius: 'var(--radius-full)',
        background: colors[variant].dot,
      }} />
      {label}
    </span>
  );
}

function StatusBadge({ label, variant, icon }: { label: string; variant: 'success' | 'error' | 'neutral' | 'accent' | 'info'; icon: React.ReactNode }) {
  const colors = {
    success: { bg: 'rgba(34, 197, 94, 0.1)', text: '#22C55E' },
    error: { bg: 'rgba(239, 68, 68, 0.1)', text: '#EF4444' },
    accent: { bg: 'var(--accent-subtle)', text: 'var(--accent-primary)' },
    info: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3B82F6' },
    neutral: { bg: 'var(--bg-tertiary)', text: 'var(--text-tertiary)' },
  };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-1)',
      padding: '4px 8px',
      fontSize: '11px',
      fontWeight: 'var(--font-medium)',
      textTransform: 'capitalize',
      borderRadius: 'var(--radius-md)',
      background: colors[variant].bg,
      color: colors[variant].text,
    }}>
      {icon}
      {label}
    </span>
  );
}

function GenerateButton({ onClick, isLoading, label }: { onClick: (e?: React.MouseEvent) => void; isLoading: boolean; label: string }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1-5)',
        padding: 'var(--space-1-5) var(--space-3)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-medium)',
        color: 'white',
        background: isHovered && !isLoading ? 'var(--accent-hover)' : 'var(--accent-primary)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: isLoading ? 'wait' : 'pointer',
        opacity: isLoading ? 0.8 : 1,
        transition: 'all 150ms ease',
      }}
    >
      {isLoading ? <LoadingSpinner size={12} color="white" /> : <SparkleIcon size={12} />}
      <span>{isLoading ? 'Generating...' : label}</span>
    </button>
  );
}

function UpdateBadge({ count, isOutdated, isLoading, onClick }: { count: number; isOutdated: boolean; isLoading: boolean; onClick: (e?: React.MouseEvent) => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (!isLoading) onClick(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (!isLoading) onClick();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        fontSize: '11px',
        fontWeight: 500,
        color: isLoading
          ? 'var(--text-tertiary)'
          : isOutdated
          ? '#F59E0B'
          : isHovered
          ? 'var(--accent-primary)'
          : 'var(--text-tertiary)',
        background: 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: isLoading ? 'wait' : 'pointer',
        transition: 'color 120ms ease',
        textDecoration: isHovered && !isLoading ? 'underline' : 'none',
        textUnderlineOffset: '2px',
      }}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size={10} />
          <span>Updating...</span>
        </>
      ) : (
        <span>{count} new</span>
      )}
    </span>
  );
}

function RefreshButton({ onClick, isLoading, isVisible = true }: { onClick: (e?: React.MouseEvent) => void; isLoading: boolean; isVisible?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (!isLoading) onClick(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (!isLoading) onClick();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        fontSize: '11px',
        fontWeight: 500,
        color: isLoading
          ? 'var(--text-tertiary)'
          : isHovered
          ? 'var(--accent-primary)'
          : 'var(--text-tertiary)',
        background: 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: isLoading ? 'wait' : 'pointer',
        // Use opacity for reveal - always renders, no layout shift
        opacity: isLoading ? 0.5 : isVisible ? 1 : 0,
        transition: 'opacity 120ms ease, color 120ms ease',
        // Prevent interaction when hidden
        pointerEvents: isVisible || isLoading ? 'auto' : 'none',
        textDecoration: isHovered && !isLoading ? 'underline' : 'none',
        textUnderlineOffset: '2px',
      }}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size={10} />
          <span>Updating...</span>
        </>
      ) : (
        <span>Refresh</span>
      )}
    </span>
  );
}

function TextLinkButton({ onClick, isLoading, label }: { onClick: (e?: React.MouseEvent) => void; isLoading: boolean; label: string }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        fontSize: '11px',
        fontWeight: 500,
        color: isLoading
          ? 'var(--text-tertiary)'
          : isHovered
          ? 'var(--accent-primary)'
          : 'var(--text-tertiary)',
        background: 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: isLoading ? 'wait' : 'pointer',
        transition: 'color 120ms ease',
        textDecoration: isHovered && !isLoading ? 'underline' : 'none',
        textUnderlineOffset: '2px',
      }}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size={10} />
          <span>Updating...</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p style={{
      marginTop: 'var(--space-2)',
      fontSize: 'var(--text-xs)',
      color: 'var(--error)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-1)',
    }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 3.5V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
      </svg>
      {message}
    </p>
  );
}

// ============================================
// Icons
// ============================================

function AIGradientIcon() {
  return (
    <div style={{
      width: '20px',
      height: '20px',
      borderRadius: 'var(--radius-md)',
      background: 'linear-gradient(135deg, var(--accent-primary) 0%, #8B5CF6 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1L9.17 5.83L14 7L9.17 8.17L8 13L6.83 8.17L2 7L6.83 5.83L8 1Z"
          fill="white"
        />
      </svg>
    </div>
  );
}

function SparkleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1L9.17 5.83L14 7L9.17 8.17L8 13L6.83 8.17L2 7L6.83 5.83L8 1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M2.5 8a5.5 5.5 0 1 1 1.288 3.546"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2.5 12V8.5H6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        flexShrink: 0,
        transition: 'transform 200ms ease',
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        color: 'var(--text-quaternary)',
      }}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingSpinner({ size = 14, color }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{
        flexShrink: 0,
        animation: 'spin 1s linear infinite',
      }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke={color || 'currentColor'}
        strokeWidth="1.5"
        strokeOpacity="0.25"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke={color || 'currentColor'}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TopicIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="2" fill="currentColor" />
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
    </svg>
  );
}

function KeyPointsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 3h8M2 6h6M2 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SentimentIcon({ sentiment }: { sentiment: 'positive' | 'neutral' | 'negative' }) {
  if (sentiment === 'positive') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 7c0 0 1 1.5 2 1.5s2-1.5 2-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="4.5" cy="5" r="0.5" fill="currentColor" />
        <circle cx="7.5" cy="5" r="0.5" fill="currentColor" />
      </svg>
    );
  }
  if (sentiment === 'negative') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 8c0 0 1-1 2-1s2 1 2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="4.5" cy="5" r="0.5" fill="currentColor" />
        <circle cx="7.5" cy="5" r="0.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="4.5" cy="5" r="0.5" fill="currentColor" />
      <circle cx="7.5" cy="5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function IntentIcon({ level }: { level: 'high' | 'medium' | 'low' }) {
  const bars = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="8" width="2" height="2" rx="0.5" fill={bars >= 1 ? 'currentColor' : 'currentColor'} opacity={bars >= 1 ? 1 : 0.3} />
      <rect x="5" y="5" width="2" height="5" rx="0.5" fill={bars >= 2 ? 'currentColor' : 'currentColor'} opacity={bars >= 2 ? 1 : 0.3} />
      <rect x="8" y="2" width="2" height="8" rx="0.5" fill={bars >= 3 ? 'currentColor' : 'currentColor'} opacity={bars >= 3 ? 1 : 0.3} />
    </svg>
  );
}
