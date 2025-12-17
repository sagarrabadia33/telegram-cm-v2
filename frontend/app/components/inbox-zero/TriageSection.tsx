'use client';

import { TriageCard } from './TriageCard';
import type { TriagedConversation } from './InboxZeroDashboard';

interface TriageSectionProps {
  bucket: 'respond' | 'review';
  title: string;
  subtitle?: string;
  conversations: TriagedConversation[];
  onOpenConversation: (conversationId: string) => void;
  onMarkAsActioned: (conversationId: string) => void;
  onRefreshData: () => void;
}

export function TriageSection({
  bucket,
  title,
  subtitle,
  conversations,
  onOpenConversation,
  onMarkAsActioned,
  onRefreshData,
}: TriageSectionProps) {
  const color = bucket === 'respond' ? 'var(--error)' : 'var(--info)';

  // Calculate total unread in this section
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <section>
      {/* Section header */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }} />
          <h2 style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {title}
          </h2>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-quaternary)',
            fontFeatureSettings: '"tnum"',
          }}>
            {conversations.length}
          </span>
          {totalUnread > 0 && (
            <span style={{
              fontSize: '10px',
              fontWeight: 500,
              color: color,
              padding: '1px 5px',
              background: `${color}15`,
              borderRadius: '8px',
              fontFeatureSettings: '"tnum"',
            }}>
              {totalUnread} unread
            </span>
          )}
        </div>
        {subtitle && (
          <p style={{
            fontSize: '11px',
            color: 'var(--text-quaternary)',
            marginTop: '2px',
            marginLeft: '14px',
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Items */}
      <div>
        {conversations.map(conversation => (
          <TriageCard
            key={conversation.id}
            conversation={conversation}
            bucket={bucket}
            onOpen={() => onOpenConversation(conversation.id)}
            onMarkAsActioned={() => onMarkAsActioned(conversation.id)}
            onRefreshData={onRefreshData}
          />
        ))}
      </div>
    </section>
  );
}
