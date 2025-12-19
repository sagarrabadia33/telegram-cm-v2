"use client";

import { useState, useEffect, useCallback } from "react";

interface ConversationSummaryProps {
  conversationId: string;
  conversationTitle?: string;
  defaultExpanded?: boolean;
  refreshTrigger?: number;
}

interface SummaryData {
  // Intelligent analysis fields (primary)
  aiSummary: string | null;
  aiStatus: string | null;
  aiAction: string | null;
  aiUrgencyLevel: string | null;
  aiSuggestedAction: string | null;
  aiStatusReason: string | null;
  aiHealthScore: number | null;
  aiChurnRisk: string | null;
  aiSentiment: string | null;
  aiAnalyzedTagName: string | null;
  aiSummaryUpdatedAt: string | null;
  hasAITag: boolean;
  // Legacy fields (fallback)
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  intentLevel: "high" | "medium" | "low";
  keyPoints: string[];
  lastTopic: string;
  summaryGeneratedAt: string;
  newMessagesSinceGenerated?: number;
}

// Status badge colors and labels
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  // Customer statuses
  healthy: { label: "Healthy", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
  at_risk: { label: "At Risk", color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.12)" },
  needs_attention: { label: "Needs Attention", color: "#EF4444", bgColor: "rgba(239, 68, 68, 0.12)" },
  team_handling: { label: "Team Handling", color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.12)" },
  needs_owner: { label: "Needs Owner", color: "#8B5CF6", bgColor: "rgba(139, 92, 246, 0.12)" },
  // Partner statuses
  nurturing: { label: "Nurturing", color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.12)" },
  high_potential: { label: "High Potential", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
  active: { label: "Active", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
  committed: { label: "Committed", color: "#8B5CF6", bgColor: "rgba(139, 92, 246, 0.12)" },
  dormant: { label: "Dormant", color: "#6B7280", bgColor: "rgba(107, 114, 128, 0.12)" },
  // Prospect statuses
  new_lead: { label: "New Lead", color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.12)" },
  qualifying: { label: "Qualifying", color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.12)" },
  demo_scheduled: { label: "Demo Scheduled", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
  proposal: { label: "Proposal", color: "#8B5CF6", bgColor: "rgba(139, 92, 246, 0.12)" },
  negotiating: { label: "Negotiating", color: "#EC4899", bgColor: "rgba(236, 72, 153, 0.12)" },
  closed_won: { label: "Closed Won", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
  closed_lost: { label: "Closed Lost", color: "#EF4444", bgColor: "rgba(239, 68, 68, 0.12)" },
  // Churned statuses
  winback_opportunity: { label: "Winback Opportunity", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
  long_shot: { label: "Long Shot", color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.12)" },
  lost_cause: { label: "Lost Cause", color: "#EF4444", bgColor: "rgba(239, 68, 68, 0.12)" },
};

// Action badge colors
const ACTION_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  "Reply Now": { label: "Reply Now", color: "#EF4444", bgColor: "rgba(239, 68, 68, 0.12)" },
  "Schedule Call": { label: "Schedule Call", color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.12)" },
  "Send Intro": { label: "Send Intro", color: "#8B5CF6", bgColor: "rgba(139, 92, 246, 0.12)" },
  "Follow Up": { label: "Follow Up", color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.12)" },
  "Nurture": { label: "Nurture", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
  "On Track": { label: "On Track", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
  "Monitor": { label: "Monitor", color: "#6B7280", bgColor: "rgba(107, 114, 128, 0.12)" },
  "Escalate": { label: "Escalate", color: "#EF4444", bgColor: "rgba(239, 68, 68, 0.12)" },
  "Personal Outreach": { label: "Personal Outreach", color: "#EC4899", bgColor: "rgba(236, 72, 153, 0.12)" },
};

// Urgency colors
const URGENCY_CONFIG: Record<string, { color: string; bgColor: string }> = {
  critical: { color: "#EF4444", bgColor: "rgba(239, 68, 68, 0.12)" },
  high: { color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.12)" },
  medium: { color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.12)" },
  low: { color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.12)" },
};

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

  // Determine if we have intelligent analysis
  const hasIntelligentAnalysis = summaryData?.aiSummary || summaryData?.aiStatus;

  // Loading skeleton
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
              AI Intelligence
            </span>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-quaternary)',
            }}>
              Not analyzed
            </span>
          </div>
          <GenerateButton
            onClick={generateSummary}
            isLoading={regenerating}
            label="Analyze"
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
        {/* Left: Icon + Title + Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, flex: 1 }}>
          <AIGradientIcon />

          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-medium)',
            color: 'var(--text-primary)',
          }}>
            AI Intelligence
          </span>

          {/* Tag name */}
          {summaryData.aiAnalyzedTagName && (
            <span style={{
              fontSize: '10px',
              color: 'var(--text-quaternary)',
              background: 'var(--bg-tertiary)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
            }}>
              {summaryData.aiAnalyzedTagName}
            </span>
          )}

          {/* Status + Action badges - visible in collapsed state */}
          {!isExpanded && hasIntelligentAnalysis && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)', marginLeft: 'var(--space-1)' }}>
              {summaryData.aiStatus && (
                <StatusBadge status={summaryData.aiStatus} />
              )}
              {summaryData.aiAction && (
                <ActionBadge action={summaryData.aiAction} />
              )}
              {summaryData.aiUrgencyLevel && (
                <UrgencyDot urgency={summaryData.aiUrgencyLevel} />
              )}
            </div>
          )}

          {/* Legacy badges for non-AI-tagged conversations */}
          {!isExpanded && !hasIntelligentAnalysis && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)', marginLeft: 'var(--space-1)' }}>
              <MicroBadge
                label={summaryData.sentiment}
                variant={summaryData.sentiment === 'positive' ? 'success' : summaryData.sentiment === 'negative' ? 'error' : 'neutral'}
              />
            </div>
          )}
        </div>

        {/* Right: Time + Update button + Chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-quaternary)',
            fontFeatureSettings: '"tnum"',
          }}>
            {summaryData.summaryGeneratedAt && formatTimeAgo(summaryData.summaryGeneratedAt)}
          </span>

          {/* New messages indicator */}
          {newMessages > 0 ? (
            <UpdateBadge
              count={newMessages}
              isOutdated={isOutdated}
              isLoading={regenerating}
              onClick={generateSummary}
            />
          ) : (
            <RefreshButton
              onClick={generateSummary}
              isLoading={regenerating}
              isVisible={isHovered}
            />
          )}

          <ChevronIcon expanded={isExpanded} />
        </div>
      </button>

      {/* Collapsed preview */}
      {!isExpanded && (
        <div style={{
          padding: '0 var(--space-4) var(--space-3)',
          paddingLeft: 'calc(var(--space-4) + 20px + var(--space-3))',
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
            {summaryData.aiSummary || summaryData.summary}
          </p>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div style={{
          padding: '0 var(--space-4) var(--space-4)',
          paddingLeft: 'calc(var(--space-4) + 20px + var(--space-3))',
        }}>
          {/* Status + Action + Urgency badges */}
          {hasIntelligentAnalysis && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-3)',
            }}>
              {summaryData.aiStatus && (
                <StatusBadge status={summaryData.aiStatus} size="large" />
              )}
              {summaryData.aiAction && (
                <ActionBadge action={summaryData.aiAction} size="large" />
              )}
              {summaryData.aiUrgencyLevel && (
                <UrgencyBadge urgency={summaryData.aiUrgencyLevel} />
              )}
              {summaryData.aiHealthScore && (
                <HealthBadge score={summaryData.aiHealthScore} />
              )}
            </div>
          )}

          {/* Summary text */}
          <p style={{
            fontSize: 'var(--text-sm)',
            lineHeight: '1.6',
            color: 'var(--text-secondary)',
            margin: '0 0 var(--space-3) 0',
          }}>
            {summaryData.aiSummary || summaryData.summary}
          </p>

          {/* Next Step / Suggested Action */}
          {summaryData.aiSuggestedAction && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.06)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-3)',
              border: '1px solid rgba(59, 130, 246, 0.12)',
              marginBottom: 'var(--space-3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <LightbulbIcon />
                <div>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-quaternary)',
                    marginBottom: '2px',
                  }}>
                    Next Step
                  </div>
                  <div style={{
                    fontSize: 'var(--text-sm)',
                    lineHeight: '1.4',
                    color: 'var(--text-primary)',
                  }}>
                    {summaryData.aiSuggestedAction}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Legacy key points (for non-AI-tagged conversations) */}
          {!hasIntelligentAnalysis && summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-quaternary)',
                marginBottom: 'var(--space-2)',
              }}>
                Key Points
              </div>
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
            </div>
          )}

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
// Badge Components
// ============================================

function StatusBadge({ status, size = 'small' }: { status: string; size?: 'small' | 'large' }) {
  const config = STATUS_CONFIG[status] || { label: status, color: 'var(--text-tertiary)', bgColor: 'var(--bg-tertiary)' };
  const padding = size === 'large' ? '4px 8px' : '2px 6px';
  const fontSize = size === 'large' ? '11px' : '10px';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding,
      fontSize,
      fontWeight: 500,
      borderRadius: 'var(--radius-sm)',
      background: config.bgColor,
      color: config.color,
      textTransform: 'capitalize',
    }}>
      <span style={{
        width: '5px',
        height: '5px',
        borderRadius: 'var(--radius-full)',
        background: config.color,
      }} />
      {config.label}
    </span>
  );
}

function ActionBadge({ action, size = 'small' }: { action: string; size?: 'small' | 'large' }) {
  const config = ACTION_CONFIG[action] || { label: action, color: 'var(--text-tertiary)', bgColor: 'var(--bg-tertiary)' };
  const padding = size === 'large' ? '4px 8px' : '2px 6px';
  const fontSize = size === 'large' ? '11px' : '10px';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding,
      fontSize,
      fontWeight: 500,
      borderRadius: 'var(--radius-sm)',
      background: config.bgColor,
      color: config.color,
    }}>
      {config.label}
    </span>
  );
}

function UrgencyDot({ urgency }: { urgency: string }) {
  const config = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.medium;
  return (
    <span
      title={`${urgency} urgency`}
      style={{
        width: '8px',
        height: '8px',
        borderRadius: 'var(--radius-full)',
        background: config.color,
        flexShrink: 0,
      }}
    />
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const config = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.medium;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      fontSize: '11px',
      fontWeight: 500,
      borderRadius: 'var(--radius-sm)',
      background: config.bgColor,
      color: config.color,
      textTransform: 'capitalize',
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: 'var(--radius-full)',
        background: config.color,
      }} />
      {urgency}
    </span>
  );
}

function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : '#EF4444';
  const bgColor = score >= 80 ? 'rgba(34, 197, 94, 0.12)' : score >= 60 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      fontSize: '11px',
      fontWeight: 500,
      borderRadius: 'var(--radius-sm)',
      background: bgColor,
      color,
    }}>
      <HeartIcon />
      {score}%
    </span>
  );
}

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

// ============================================
// Button Components
// ============================================

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
      <span>{isLoading ? 'Analyzing...' : label}</span>
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
        opacity: isLoading ? 0.5 : isVisible ? 1 : 0,
        transition: 'opacity 120ms ease, color 120ms ease',
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

function LightbulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
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
