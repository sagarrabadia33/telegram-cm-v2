'use client';

import type { Commitment } from './InboxZeroDashboard';

interface CommitmentsPanelProps {
  commitments: {
    overdue: Commitment[];
    dueToday: Commitment[];
    upcoming: Commitment[];
  };
  onComplete: (commitmentId: string) => void;
  onOpenConversation: (conversationId: string) => void;
}

export function CommitmentsPanel({
  commitments,
  onComplete,
  onOpenConversation,
}: CommitmentsPanelProps) {
  const totalCount = commitments.overdue.length + commitments.dueToday.length + commitments.upcoming.length;

  if (totalCount === 0) {
    return null;
  }

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((date.getTime() - now.getTime()) / 86400000);

    if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div>
      <h3 style={{
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--text-quaternary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '10px',
      }}>
        Commitments
        <span style={{
          marginLeft: '8px',
          fontFeatureSettings: '"tnum"',
        }}>
          {totalCount}
        </span>
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Overdue */}
        {commitments.overdue.map(c => (
          <CommitmentRow
            key={c.id}
            commitment={c}
            status="overdue"
            dueLabel={formatDueDate(c.dueDate)}
            onComplete={() => onComplete(c.id)}
            onOpen={() => onOpenConversation(c.conversationId)}
          />
        ))}

        {/* Due today */}
        {commitments.dueToday.map(c => (
          <CommitmentRow
            key={c.id}
            commitment={c}
            status="today"
            dueLabel={formatDueDate(c.dueDate)}
            onComplete={() => onComplete(c.id)}
            onOpen={() => onOpenConversation(c.conversationId)}
          />
        ))}

        {/* Upcoming */}
        {commitments.upcoming.slice(0, 3).map(c => (
          <CommitmentRow
            key={c.id}
            commitment={c}
            status="upcoming"
            dueLabel={formatDueDate(c.dueDate)}
            onComplete={() => onComplete(c.id)}
            onOpen={() => onOpenConversation(c.conversationId)}
          />
        ))}
      </div>
    </div>
  );
}

interface CommitmentRowProps {
  commitment: Commitment;
  status: 'overdue' | 'today' | 'upcoming';
  dueLabel: string;
  onComplete: () => void;
  onOpen: () => void;
}

function CommitmentRow({ commitment, status, dueLabel, onComplete, onOpen }: CommitmentRowProps) {
  const color = status === 'overdue' ? 'var(--error)' : status === 'today' ? 'var(--warning)' : 'var(--text-quaternary)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px 0',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border-subtle)',
      }}
      onClick={onOpen}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '3px',
          border: `1.5px solid ${color}`,
          background: 'transparent',
          cursor: 'pointer',
          flexShrink: 0,
          marginTop: '1px',
        }}
      />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '12px',
          color: 'var(--text-primary)',
          margin: 0,
          lineHeight: 1.4,
        }}>
          {commitment.content}
        </p>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '2px',
        }}>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-tertiary)',
          }}>
            {commitment.contactName}
          </span>
          {dueLabel && (
            <>
              <span style={{
                fontSize: '11px',
                color: 'var(--text-quaternary)',
              }}>
                ·
              </span>
              <span style={{
                fontSize: '11px',
                color,
                fontFeatureSettings: '"tnum"',
              }}>
                {dueLabel}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
