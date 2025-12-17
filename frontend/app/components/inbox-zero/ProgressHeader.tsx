'use client';

interface ProgressHeaderProps {
  respondCount: number;
  reviewCount: number;
  clearCount: number;
  totalUnread: number;
  completedCount: number;
  percentage: number;
}

export function ProgressHeader({
  respondCount,
  reviewCount,
  clearCount,
  totalUnread,
  completedCount,
  percentage,
}: ProgressHeaderProps) {
  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      {/* Stats row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '10px',
      }}>
        {/* Main count - unread messages */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFeatureSettings: '"tnum"',
            letterSpacing: '-0.02em',
          }}>
            {totalUnread}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            unread
          </span>
        </div>

        {/* Divider */}
        <div style={{
          width: '1px',
          height: '20px',
          background: 'var(--border-subtle)',
        }} />

        {/* Breakdown by bucket */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {respondCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--error)',
              }} />
              <span style={{
                fontSize: '12px',
                color: 'var(--text-tertiary)',
              }}>
                <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontFeatureSettings: '"tnum"' }}>
                  {respondCount}
                </span>
                {' '}need reply
              </span>
            </div>
          )}
          {reviewCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--info)',
              }} />
              <span style={{
                fontSize: '12px',
                color: 'var(--text-tertiary)',
              }}>
                <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontFeatureSettings: '"tnum"' }}>
                  {reviewCount}
                </span>
                {' '}to review
              </span>
            </div>
          )}
          {clearCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--text-quaternary)',
              }} />
              <span style={{
                fontSize: '12px',
                color: 'var(--text-tertiary)',
              }}>
                <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontFeatureSettings: '"tnum"' }}>
                  {clearCount}
                </span>
                {' '}to clear
              </span>
            </div>
          )}
        </div>

        {/* Completed today - pushed to right */}
        {completedCount > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginLeft: 'auto',
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"
                fill="var(--success)"
              />
            </svg>
            <span style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              fontFeatureSettings: '"tnum"',
            }}>
              {completedCount} done today
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        height: '3px',
        background: 'var(--border-subtle)',
        borderRadius: '2px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${percentage}%`,
          background: percentage === 100 ? 'var(--success)' : 'var(--accent-primary)',
          borderRadius: '2px',
          transition: 'width 300ms ease',
        }} />
      </div>
    </div>
  );
}
