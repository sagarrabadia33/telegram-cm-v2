'use client';

import { useState } from 'react';
import { DraftReplyEditor } from './DraftReplyEditor';
import type { TriagedConversation } from './InboxZeroDashboard';

interface TriageCardProps {
  conversation: TriagedConversation;
  bucket: 'respond' | 'review';
  onOpen: () => void;
  onMarkAsActioned: () => void;
  onRefreshData: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function TriageCard({
  conversation,
  bucket,
  onOpen,
  onMarkAsActioned,
  onRefreshData,
}: TriageCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const triage = conversation.triage;

  const timeAgo = conversation.lastMessage?.sentAt
    ? formatRelativeTime(conversation.lastMessage.sentAt)
    : '';

  const tag = conversation.tags[0];
  const hasUnread = conversation.unreadCount > 0;

  // Build indicator labels
  const indicators: string[] = [];
  if (triage?.isDirectMention) indicators.push('@mention');
  if (triage?.isQuestion) indicators.push('Question');
  if (triage?.hasOverduePromise) indicators.push('Overdue');
  if (triage?.isComplaint) indicators.push('Issue');

  // Conversation state label
  const stateLabels: Record<string, { label: string; color: string }> = {
    'waiting_on_them': { label: 'Ball in their court', color: 'var(--info)' },
    'waiting_on_you': { label: 'Needs your reply', color: 'var(--error)' },
    'concluded': { label: 'Resolved', color: 'var(--success)' },
    'ongoing': { label: 'Active', color: 'var(--text-quaternary)' },
  };
  const conversationState = triage?.conversationState;
  const stateInfo = conversationState ? stateLabels[conversationState] : null;

  // Suggested action label
  const actionLabels: Record<string, string> = {
    'reply': 'Reply',
    'follow_up': 'Follow up',
    'wait': 'Wait',
    'close': 'Mark done',
  };
  const suggestedAction = triage?.suggestedAction ? actionLabels[triage.suggestedAction] : null;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        background: isHovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 100ms',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (bucket === 'respond') {
          setIsExpanded(!isExpanded);
        } else {
          onOpen();
        }
      }}
    >
      {/* Main row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '10px 0',
        gap: '10px',
      }}>
        {/* Avatar with unread indicator */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.9)',
            background: conversation.avatarUrl
              ? `url(${conversation.avatarUrl}) center/cover`
              : tag?.color || 'var(--accent-primary)',
          }}>
            {!conversation.avatarUrl && getInitials(conversation.title)}
          </div>
          {/* Unread badge */}
          {hasUnread && (
            <span style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              minWidth: '16px',
              height: '16px',
              padding: '0 4px',
              fontSize: '10px',
              fontWeight: 600,
              color: '#fff',
              background: bucket === 'respond' ? 'var(--error)' : 'var(--info)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFeatureSettings: '"tnum"',
            }}>
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header line */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '1px',
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: hasUnread ? 600 : 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {conversation.title}
            </span>
            {tag && (
              <span style={{
                fontSize: '10px',
                fontWeight: 500,
                color: tag.color || 'var(--text-tertiary)',
                padding: '1px 5px',
                background: `${tag.color || 'var(--text-tertiary)'}15`,
                borderRadius: '3px',
                flexShrink: 0,
              }}>
                {tag.name}
              </span>
            )}
            <span style={{
              fontSize: '11px',
              color: 'var(--text-quaternary)',
              marginLeft: 'auto',
              flexShrink: 0,
              fontFeatureSettings: '"tnum"',
            }}>
              {timeAgo}
            </span>
          </div>

          {/* Message preview */}
          {conversation.lastMessage?.body && (
            <p style={{
              fontSize: '12px',
              color: hasUnread ? 'var(--text-secondary)' : 'var(--text-tertiary)',
              fontWeight: hasUnread ? 500 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              margin: 0,
              lineHeight: 1.4,
            }}>
              {conversation.lastMessage.direction === 'outbound' && (
                <span style={{ color: 'var(--text-quaternary)', fontWeight: 400 }}>You: </span>
              )}
              {conversation.lastMessage.body}
            </p>
          )}

          {/* Indicators and conversation state */}
          {(indicators.length > 0 || triage?.reason || stateInfo) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '4px',
              flexWrap: 'wrap',
            }}>
              {/* Conversation state - most important */}
              {stateInfo && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    color: stateInfo.color,
                    padding: '1px 5px',
                    background: `${stateInfo.color}15`,
                    borderRadius: '3px',
                  }}
                >
                  {stateInfo.label}
                </span>
              )}
              {/* Suggested action */}
              {suggestedAction && suggestedAction !== 'Wait' && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    color: 'var(--accent-primary)',
                    padding: '1px 5px',
                    background: 'var(--accent-primary)15',
                    borderRadius: '3px',
                  }}
                >
                  → {suggestedAction}
                </span>
              )}
              {/* Other indicators */}
              {indicators.map(ind => (
                <span
                  key={ind}
                  style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    color: ind === 'Overdue' ? 'var(--error)' : 'var(--text-quaternary)',
                    padding: '1px 4px',
                    background: ind === 'Overdue' ? 'var(--error)10' : 'var(--bg-tertiary)',
                    borderRadius: '3px',
                  }}
                >
                  {ind}
                </span>
              ))}
              {triage?.reason && !indicators.length && !stateInfo && (
                <span style={{
                  fontSize: '10px',
                  color: 'var(--text-quaternary)',
                }}>
                  {triage.reason}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions - show on hover */}
        {isHovered && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {bucket === 'review' && (
              <>
                <button
                  onClick={onOpen}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--text-tertiary)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Open
                </button>
                <button
                  onClick={onMarkAsActioned}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--success)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </>
            )}
          </div>
        )}

        {/* Chevron for respond bucket */}
        {bucket === 'respond' && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            style={{
              flexShrink: 0,
              color: 'var(--text-quaternary)',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms',
              marginTop: '4px',
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
        )}
      </div>

      {/* Expanded draft editor */}
      {bucket === 'respond' && isExpanded && (
        <div
          style={{ padding: '0 0 12px 42px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <DraftReplyEditor
            conversationId={conversation.id}
            initialDraft={triage?.draftReply || ''}
            initialTone={(triage?.draftTone as 'casual' | 'professional' | 'warm' | 'empathetic') || 'casual'}
            onSend={() => onMarkAsActioned()}
            onDismiss={onMarkAsActioned}
            onOpen={onOpen}
            onRefreshData={onRefreshData}
          />
        </div>
      )}
    </div>
  );
}
