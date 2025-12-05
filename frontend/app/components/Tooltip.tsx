'use client';

import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ============================================
// LINEAR-STYLE TOOLTIP COMPONENT
// Matches the design system in globals.css
// ============================================

export interface TooltipProps {
  /** The trigger element (what user hovers over) */
  children: ReactNode;
  /** Tooltip content - can be string or JSX */
  content: ReactNode;
  /** Position relative to trigger */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing (ms) */
  delay?: number;
  /** Additional className for the tooltip */
  className?: string;
  /** Whether tooltip is disabled */
  disabled?: boolean;
  /** Max width of tooltip */
  maxWidth?: number;
}

export default function Tooltip({
  children,
  content,
  position = 'top',
  delay = 100,
  className = '',
  disabled = false,
  maxWidth = 240,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate position using fixed positioning (no scroll offset needed)
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2;
        y = rect.top - 8;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom + 8;
        break;
      case 'left':
        x = rect.left - 8;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
        x = rect.right + 8;
        y = rect.top + rect.height / 2;
        break;
    }

    setCoords({ x, y });
  }, [position]);

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;

    // Calculate position immediately, show after delay
    updatePosition();

    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay, disabled, updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Get transform based on position
  const getTransform = () => {
    switch (position) {
      case 'top':
        return 'translate(-50%, -100%)';
      case 'bottom':
        return 'translate(-50%, 0)';
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </div>

      {isVisible && typeof window !== 'undefined' && createPortal(
        <div
          className={`linear-tooltip ${className}`}
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            transform: getTransform(),
            maxWidth: maxWidth,
            // Linear-style tooltip appearance
            background: 'var(--bg-elevated, #1a1a1a)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '6px 10px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            zIndex: 10000,
            pointerEvents: 'none',
            // Simple fade-in animation (no transform conflicts)
            animation: 'fadeIn 100ms ease-out',
            opacity: 1,
          }}
        >
          {/* Content */}
          <div style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            lineHeight: '1.4',
            whiteSpace: 'normal',
            wordWrap: 'break-word',
          }}>
            {content}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ============================================
// RICH TOOLTIP - For tooltips with title + description
// ============================================

export interface RichTooltipProps extends Omit<TooltipProps, 'content'> {
  /** Title text */
  title: string;
  /** Optional description/subtitle */
  description?: string;
  /** Optional keyboard shortcut hint */
  shortcut?: string;
}

export function RichTooltip({
  children,
  title,
  description,
  shortcut,
  ...props
}: RichTooltipProps) {
  const content = (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--text-primary)',
        }}>
          {title}
        </span>
        {shortcut && (
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-quaternary)',
            padding: '2px 5px',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            fontFamily: 'system-ui, sans-serif',
          }}>
            {shortcut}
          </span>
        )}
      </div>
      {description && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          marginTop: '2px',
        }}>
          {description}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip content={content} {...props}>
      {children}
    </Tooltip>
  );
}

// ============================================
// STATUS TOOLTIP - For status indicators like "Live"
// ============================================

export interface StatusTooltipProps extends Omit<TooltipProps, 'content'> {
  /** Status title */
  title: string;
  /** Status description */
  status: string;
}

export function StatusTooltip({
  children,
  title,
  status,
  ...props
}: StatusTooltipProps) {
  const content = (
    <div>
      <div style={{
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--text-primary)',
        marginBottom: '4px',
      }}>
        {title}
      </div>
      <div style={{
        fontSize: '10px',
        color: 'var(--text-tertiary)',
      }}>
        {status}
      </div>
    </div>
  );

  return (
    <Tooltip content={content} maxWidth={160} {...props}>
      {children}
    </Tooltip>
  );
}
