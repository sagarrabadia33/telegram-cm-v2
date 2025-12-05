'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

// ============================================
// LINEAR-STYLE TAG DROPDOWN COMPONENT
// Reusable tag selection & creation dropdown
// Matches the design system in globals.css
// ============================================

// Tag type
export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

// Available tag colors for creation
export const TAG_COLORS = [
  '#E17076', // Red
  '#FAA774', // Orange
  '#F5C04A', // Yellow
  '#7BC862', // Green
  '#6EC9CB', // Cyan
  '#65AADD', // Blue
  '#A695E7', // Violet
  '#EE7AAE', // Pink
];

export interface TagDropdownProps {
  /** Whether the dropdown is open */
  isOpen: boolean;
  /** Called when dropdown should close */
  onClose: () => void;
  /** Position of the dropdown */
  position: { top: number; left: number };
  /** All available tags */
  availableTags: Tag[];
  /** Currently selected/assigned tags */
  selectedTags: Tag[];
  /** Called when a tag is toggled */
  onTagToggle: (tag: Tag, isSelected: boolean) => void;
  /** Called to create and add a new tag */
  onTagCreate: (name: string, color: string) => void;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** Use portal (recommended for dropdowns inside scroll containers) */
  usePortal?: boolean;
  /** Width of dropdown */
  width?: number;
}

export default function TagDropdown({
  isOpen,
  onClose,
  position,
  availableTags,
  selectedTags,
  onTagToggle,
  onTagCreate,
  searchPlaceholder = 'Search or create label...',
  usePortal = true,
  width = 220,
}: TagDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  // Filter tags by search query
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return availableTags;
    const query = searchQuery.toLowerCase();
    return availableTags.filter(tag =>
      tag.name.toLowerCase().includes(query)
    );
  }, [availableTags, searchQuery]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Focus create input when switching to create mode
  useEffect(() => {
    if (isCreatingTag && createInputRef.current) {
      setTimeout(() => createInputRef.current?.focus(), 50);
    }
  }, [isCreatingTag]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reset state when closing
  const handleClose = () => {
    setSearchQuery('');
    setIsCreatingTag(false);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[0]);
    onClose();
  };

  // Handle tag creation
  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    onTagCreate(newTagName.trim(), newTagColor);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[0]);
    setIsCreatingTag(false);
  };

  // Check if tag is selected
  const isTagSelected = (tagId: string) => {
    return selectedTags.some(t => t.id === tagId);
  };

  if (!isOpen) return null;

  const dropdownContent = (
    <div
      ref={dropdownRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: usePortal ? 'fixed' : 'absolute',
        top: position.top,
        left: position.left,
        width: width,
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        zIndex: 9999,
        animation: 'dropdownEnter 150ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {!isCreatingTag ? (
        <>
          {/* Search Input */}
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  handleClose();
                }
              }}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: '4px',
                outline: 'none',
              }}
            />
          </div>

          {/* Tag List with Checkboxes */}
          <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '4px' }}>
            {filteredTags.length === 0 && !searchQuery.trim() ? (
              <div style={{
                padding: '12px',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                textAlign: 'center',
              }}>
                No labels available
              </div>
            ) : filteredTags.length === 0 && searchQuery.trim() ? (
              <div style={{
                padding: '8px',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                textAlign: 'center',
              }}>
                No labels found
              </div>
            ) : (
              filteredTags.map((tag) => {
                const selected = isTagSelected(tag.id);
                return (
                  <TagItem
                    key={tag.id}
                    tag={tag}
                    isSelected={selected}
                    onClick={() => onTagToggle(tag, selected)}
                  />
                );
              })
            )}
          </div>

          {/* Create New Label Option */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '4px' }}>
            <button
              onClick={() => setIsCreatingTag(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--accent-primary)',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <PlusIcon size={12} />
              Create new label
            </button>
          </div>

          {/* Keyboard Hints */}
          <div style={{
            padding: '6px 8px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            borderRadius: '0 0 8px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <KeyboardHint keyLabel="↵" action="select" />
            <KeyboardHint keyLabel="esc" action="close" />
          </div>
        </>
      ) : (
        /* Create New Tag Form */
        <div style={{ padding: '12px' }}>
          <div style={{
            marginBottom: '8px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Create Label
          </div>
          <input
            ref={createInputRef}
            type="text"
            placeholder="Label name..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateTag();
              if (e.key === 'Escape') {
                setIsCreatingTag(false);
                setNewTagName('');
              }
            }}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              outline: 'none',
              marginBottom: '10px',
            }}
          />

          {/* Color Picker */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {TAG_COLORS.map(color => (
              <button
                key={color}
                onClick={() => setNewTagColor(color)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  background: color,
                  border: newTagColor === color ? '2px solid var(--text-primary)' : 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                setIsCreatingTag(false);
                setNewTagName('');
              }}
              style={{
                flex: 1,
                padding: '8px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              style={{
                flex: 1,
                padding: '8px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'white',
                background: newTagName.trim() ? 'var(--accent-primary)' : 'var(--text-quaternary)',
                border: 'none',
                borderRadius: '6px',
                cursor: newTagName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (usePortal && typeof document !== 'undefined') {
    return createPortal(dropdownContent, document.body);
  }

  return dropdownContent;
}

// ============================================
// Tag Item Component
// ============================================

interface TagItemProps {
  tag: Tag;
  isSelected: boolean;
  onClick: () => void;
}

function TagItem({ tag, isSelected, onClick }: TagItemProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '6px 8px',
        fontSize: '12px',
        color: 'var(--text-primary)',
        background: 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {/* Checkbox */}
      <span style={{
        width: '14px',
        height: '14px',
        borderRadius: '3px',
        border: isSelected ? 'none' : '1px solid var(--border-default)',
        background: isSelected ? 'var(--accent-primary)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {isSelected && <CheckIcon size={10} color="white" />}
      </span>

      {/* Color Dot */}
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: tag.color || 'var(--text-quaternary)',
        flexShrink: 0,
      }} />

      {/* Name */}
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {tag.name}
      </span>
    </button>
  );
}

// ============================================
// Keyboard Hint Component
// ============================================

interface KeyboardHintProps {
  keyLabel: string;
  action: string;
}

function KeyboardHint({ keyLabel, action }: KeyboardHintProps) {
  return (
    <span style={{
      fontSize: '10px',
      color: 'var(--text-quaternary)',
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
    }}>
      <kbd style={{
        padding: '1px 4px',
        background: 'var(--bg-tertiary)',
        borderRadius: '3px',
        fontSize: '9px',
      }}>
        {keyLabel}
      </kbd>
      {action}
    </span>
  );
}

// ============================================
// Icons
// ============================================

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function CheckIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8l3 3 7-7" />
    </svg>
  );
}
