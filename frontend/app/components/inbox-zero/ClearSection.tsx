'use client';

import { useState } from 'react';

interface ClearSectionProps {
  count: number;
  groups: Array<{ id: string; name: string; count: number }>;
  onClearAll: () => void;
}

export function ClearSection({ count, groups, onClearAll }: ClearSectionProps) {
  const [isClearing, setIsClearing] = useState(false);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await onClearAll();
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <section>
      {/* Section header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '4px',
      }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--text-quaternary)',
          flexShrink: 0,
        }} />
        <h2 style={{
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Clear
        </h2>
        <span style={{
          fontSize: '11px',
          color: 'var(--text-quaternary)',
          fontFeatureSettings: '"tnum"',
        }}>
          {count}
        </span>
      </div>

      {/* Card */}
      <div style={{
        padding: '12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '6px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <span style={{
              fontSize: '13px',
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}>
              {count} messages
            </span>
            <span style={{
              fontSize: '13px',
              color: 'var(--text-tertiary)',
              marginLeft: '4px',
            }}>
              in {groups.length} groups
            </span>
          </div>
          <button
            onClick={handleClear}
            disabled={isClearing}
            style={{
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 500,
              color: isClearing ? 'var(--text-quaternary)' : 'var(--success)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              cursor: isClearing ? 'default' : 'pointer',
            }}
          >
            {isClearing ? 'Clearing...' : 'Clear all'}
          </button>
        </div>

        {/* Group pills */}
        {groups.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginTop: '10px',
          }}>
            {groups.map(group => (
              <span
                key={group.id}
                style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  padding: '2px 6px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '4px',
                }}
              >
                {group.name}
                <span style={{
                  color: 'var(--text-quaternary)',
                  marginLeft: '4px',
                  fontFeatureSettings: '"tnum"',
                }}>
                  {group.count}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
