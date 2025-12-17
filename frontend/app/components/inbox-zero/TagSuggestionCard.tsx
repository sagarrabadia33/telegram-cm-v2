'use client';

import type { TagSuggestion } from './InboxZeroDashboard';

interface TagSuggestionCardProps {
  suggestion: TagSuggestion;
  onAccept: () => void;
  onReject: () => void;
}

export function TagSuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: TagSuggestionCardProps) {
  const tagColor = suggestion.suggestedTag.color || '#5E6AD2';

  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '6px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '6px',
      }}>
        <span style={{
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--text-primary)',
        }}>
          {suggestion.contactName}
        </span>
        <span style={{
          fontSize: '10px',
          fontWeight: 500,
          color: tagColor,
          padding: '2px 6px',
          background: `${tagColor}15`,
          borderRadius: '3px',
        }}>
          {suggestion.suggestedTag.name}
        </span>
      </div>

      {/* Reason */}
      <p style={{
        fontSize: '11px',
        color: 'var(--text-tertiary)',
        margin: 0,
        marginBottom: '10px',
        lineHeight: 1.4,
      }}>
        {suggestion.reason}
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={onAccept}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--success)',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
        <button
          onClick={onReject}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-tertiary)',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
