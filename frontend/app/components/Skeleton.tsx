'use client';

import { CSSProperties } from 'react';

/**
 * Skeleton Loading Components - Linear-style shimmer effect
 * Shows animated placeholders while content loads
 */

// Base skeleton with shimmer animation
export function Skeleton({
  width,
  height,
  borderRadius = '4px',
  style,
  className,
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            var(--bg-tertiary) 25%,
            var(--bg-hover) 50%,
            var(--bg-tertiary) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
      `}</style>
      <div
        className={`skeleton-shimmer ${className || ''}`}
        style={{
          width: width || '100%',
          height: height || '16px',
          borderRadius,
          ...style,
        }}
      />
    </>
  );
}

// Conversation item skeleton
export function ConversationSkeleton() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '12px',
      borderRadius: '8px',
    }}>
      {/* Avatar */}
      <Skeleton width={44} height={44} borderRadius="50%" />

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {/* Name and time row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width={40} height={12} />
        </div>
        {/* Message preview */}
        <Skeleton width="80%" height={12} />
        {/* Tags */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
          <Skeleton width={50} height={16} borderRadius="4px" />
          <Skeleton width={40} height={16} borderRadius="4px" />
        </div>
      </div>
    </div>
  );
}

// Conversations list skeleton (multiple items with staggered animation)
export function ConversationsListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div style={{ padding: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            opacity: 1 - (i * 0.08), // Fade out lower items
            animationDelay: `${i * 50}ms`,
          }}
        >
          <ConversationSkeleton />
        </div>
      ))}
    </div>
  );
}

// Message skeleton
export function MessageSkeleton({ sent = false }: { sent?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: sent ? 'flex-end' : 'flex-start',
      padding: '4px 16px',
    }}>
      <div style={{
        maxWidth: '70%',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        <Skeleton
          width={sent ? 180 : 220}
          height={40}
          borderRadius="12px"
          style={{
            borderBottomRightRadius: sent ? '4px' : '12px',
            borderBottomLeftRadius: sent ? '12px' : '4px',
          }}
        />
        <Skeleton width={50} height={10} style={{ alignSelf: sent ? 'flex-end' : 'flex-start' }} />
      </div>
    </div>
  );
}

// Messages list skeleton
export function MessagesListSkeleton({ count = 6 }: { count?: number }) {
  // Alternate between sent and received for realistic preview
  const pattern = [false, false, true, false, true, false, false, true];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            opacity: 0.3 + (i * 0.1), // Fade in from top
            animationDelay: `${i * 30}ms`,
          }}
        >
          <MessageSkeleton sent={pattern[i % pattern.length]} />
        </div>
      ))}
    </div>
  );
}

// Contact row skeleton
export function ContactSkeleton() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {/* Checkbox */}
      <Skeleton width={16} height={16} borderRadius="4px" />
      {/* Avatar */}
      <Skeleton width={36} height={36} borderRadius="50%" />
      {/* Name */}
      <Skeleton width="25%" height={14} />
      {/* Type */}
      <Skeleton width={60} height={20} borderRadius="4px" />
      {/* Messages */}
      <Skeleton width={40} height={12} />
      {/* Last interaction */}
      <Skeleton width={80} height={12} />
      {/* Tags */}
      <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
        <Skeleton width={50} height={18} borderRadius="4px" />
      </div>
    </div>
  );
}

// Contacts table skeleton
export function ContactsTableSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-secondary)',
      }}>
        <Skeleton width={16} height={16} borderRadius="4px" />
        <Skeleton width={36} height={36} borderRadius="50%" style={{ visibility: 'hidden' }} />
        <Skeleton width={80} height={12} />
        <Skeleton width={50} height={12} />
        <Skeleton width={60} height={12} />
        <Skeleton width={80} height={12} />
        <Skeleton width={60} height={12} />
      </div>
      {/* Rows */}
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            opacity: 1 - (i * 0.06),
            animationDelay: `${i * 40}ms`,
          }}
        >
          <ContactSkeleton />
        </div>
      ))}
    </div>
  );
}

// Full page loading state with skeleton
export function PageSkeleton() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Left panel - Conversations */}
      <div style={{
        width: '320px',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Skeleton width={100} height={20} style={{ marginBottom: '12px' }} />
          <Skeleton width="100%" height={36} borderRadius="8px" />
        </div>
        {/* List */}
        <ConversationsListSkeleton count={10} />
      </div>

      {/* Middle panel - Messages */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <Skeleton width={40} height={40} borderRadius="50%" />
          <div>
            <Skeleton width={150} height={16} style={{ marginBottom: '4px' }} />
            <Skeleton width={80} height={12} />
          </div>
        </div>
        {/* Messages */}
        <div style={{ flex: 1, padding: '16px' }}>
          <MessagesListSkeleton count={8} />
        </div>
        {/* Input */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border-subtle)' }}>
          <Skeleton width="100%" height={44} borderRadius="22px" />
        </div>
      </div>

      {/* Right panel - AI Assistant */}
      <div style={{
        width: '360px',
        borderLeft: '1px solid var(--border-subtle)',
        padding: '16px',
      }}>
        <Skeleton width={120} height={20} style={{ marginBottom: '16px' }} />
        <Skeleton width="100%" height={100} borderRadius="8px" style={{ marginBottom: '12px' }} />
        <Skeleton width="100%" height={60} borderRadius="8px" />
      </div>
    </div>
  );
}

// Inline loading spinner (for buttons, small areas)
export function InlineSpinner({ size = 16 }: { size?: number }) {
  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        style={{ animation: 'spin 0.8s linear infinite' }}
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke="currentColor"
          strokeWidth="2"
          strokeOpacity="0.25"
        />
        <path
          d="M14 8a6 6 0 00-6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </>
  );
}
