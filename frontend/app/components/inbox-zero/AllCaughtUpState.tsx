'use client';

interface AllCaughtUpStateProps {
  completedToday?: number;
}

export function AllCaughtUpState({ completedToday = 0 }: AllCaughtUpStateProps) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '60px 24px',
    }}>
      {/* Celebration icon */}
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'var(--success)10',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M12 16l4 4 8-10"
            stroke="var(--success)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>

      <h2 style={{
        fontSize: '18px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: '6px',
        letterSpacing: '-0.01em',
      }}>
        Inbox Zero
      </h2>

      <p style={{
        fontSize: '13px',
        color: 'var(--text-tertiary)',
        maxWidth: '300px',
        lineHeight: 1.5,
        marginBottom: '20px',
      }}>
        {completedToday > 0
          ? `You've handled ${completedToday} ${completedToday === 1 ? 'item' : 'items'} today. Great work!`
          : 'No messages need your attention right now. Enjoy the calm.'}
      </p>

      {/* Tips section */}
      <div style={{
        padding: '16px 20px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        maxWidth: '340px',
        textAlign: 'left',
      }}>
        <p style={{
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--text-quaternary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '10px',
        }}>
          Pro tips
        </p>
        <ul style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <li style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}>
            <span style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>•</span>
            Press <kbd style={{
              padding: '1px 4px',
              fontSize: '10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '3px',
            }}>R</kbd> to refresh and analyze new messages
          </li>
          <li style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}>
            <span style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>•</span>
            Use tags to prioritize contacts and get smarter triaging
          </li>
          <li style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}>
            <span style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>•</span>
            AI learns your writing style for better draft suggestions
          </li>
        </ul>
      </div>
    </div>
  );
}
