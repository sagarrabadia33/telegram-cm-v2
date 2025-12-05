'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
  category?: string | null;
  isDirect?: boolean;
  isInherited?: boolean;
}

interface TagSelectorProps {
  conversationId: string;
  onTagsChange?: (tags: Tag[]) => void;
}

// Linear-style color palette - curated, consistent colors
const TAG_COLOR_PALETTE = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Gray', value: '#6B7280' },
];

export function TagSelector({ conversationId, onTagsChange }: TagSelectorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assignedTags, setAssignedTags] = useState<Tag[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedColor, setSelectedColor] = useState(TAG_COLOR_PALETTE[5].value); // Default blue
  const [createLoading, setCreateLoading] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Check if search query matches an existing tag
  const exactMatch = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return allTags.find(tag => tag.name.toLowerCase() === searchQuery.toLowerCase().trim());
  }, [allTags, searchQuery]);

  // Filter tags based on search
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return allTags;
    const query = searchQuery.toLowerCase();
    return allTags.filter(tag =>
      tag.name.toLowerCase().includes(query) ||
      tag.description?.toLowerCase().includes(query)
    );
  }, [allTags, searchQuery]);

  // Show create option when no exact match and query is not empty
  const showCreateOption = useMemo(() => {
    return searchQuery.trim().length > 0 && !exactMatch && !isCreating;
  }, [searchQuery, exactMatch, isCreating]);

  // Total items including create option
  const totalItems = filteredTags.length + (showCreateOption ? 1 : 0);

  // Fetch all tags and assigned tags
  useEffect(() => {
    fetchAllTags();
    fetchAssignedTags();
  }, [conversationId]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
      setSearchQuery('');
      setFocusedIndex(0);
      setIsCreating(false);
      setSelectedColor(TAG_COLOR_PALETTE[5].value);
    }
  }, [isOpen]);

  // Calculate dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = isCreating ? 200 : 380;
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;

      const positionAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

      setDropdownPosition({
        top: positionAbove ? rect.top - dropdownHeight - 8 : rect.bottom + 8,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 300 - 16)),
      });
    }
  }, [isCreating]);

  // Handle open/close
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
    }
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [isOpen, updateDropdownPosition]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          if (isCreating) {
            setIsCreating(false);
          } else {
            setIsOpen(false);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, totalItems - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (isCreating) {
            handleCreateTag();
          } else if (showCreateOption && focusedIndex === filteredTags.length) {
            // Create option is focused
            setIsCreating(true);
          } else if (filteredTags[focusedIndex]) {
            toggleTag(filteredTags[focusedIndex]);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusedIndex, filteredTags, showCreateOption, isCreating, totalItems]);

  // Reset focused index when search changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [searchQuery]);

  const fetchAllTags = async () => {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      if (data.success) {
        setAllTags(data.data);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const fetchAssignedTags = async () => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/tags`);
      const data = await response.json();
      if (data.success) {
        setAssignedTags(data.data);
        onTagsChange?.(data.data);
      }
    } catch (error) {
      console.error('Error fetching assigned tags:', error);
    }
  };

  const handleCreateTag = async () => {
    if (!searchQuery.trim() || createLoading) return;

    setCreateLoading(true);
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: searchQuery.trim(),
          color: selectedColor,
        }),
      });

      const data = await response.json();
      if (data.success) {
        const newTag: Tag = {
          id: data.data.id,
          name: data.data.name,
          color: data.data.color,
        };

        // Add to all tags
        setAllTags(prev => [...prev, newTag]);

        // Immediately assign to conversation
        const newAssigned = [...assignedTags, newTag];
        setAssignedTags(newAssigned);
        onTagsChange?.(newAssigned);

        // Fire-and-forget assignment
        fetch(`/api/conversations/${conversationId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagId: newTag.id }),
        }).catch(console.error);

        // Reset state
        setSearchQuery('');
        setIsCreating(false);
        setSelectedColor(TAG_COLOR_PALETTE[5].value);
      } else {
        console.error('Failed to create tag:', data.error);
      }
    } catch (error) {
      console.error('Error creating tag:', error);
    } finally {
      setCreateLoading(false);
    }
  };

  const toggleTag = (tag: Tag) => {
    const isAssigned = assignedTags.some((t) => t.id === tag.id);

    // Immediate optimistic update
    const newTags = isAssigned
      ? assignedTags.filter((t) => t.id !== tag.id)
      : [...assignedTags, tag];
    setAssignedTags(newTags);
    onTagsChange?.(newTags);

    // Fire-and-forget API call
    const apiCall = isAssigned
      ? fetch(`/api/conversations/${conversationId}/tags?tagId=${tag.id}`, { method: 'DELETE' })
      : fetch(`/api/conversations/${conversationId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagId: tag.id }),
        });

    apiCall.catch((error) => {
      console.error('Error toggling tag:', error);
    });
  };

  const dropdown = isOpen && typeof window !== 'undefined' && createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
        }}
        onClick={() => setIsOpen(false)}
      />

      {/* Dropdown */}
      <div
        ref={dropdownRef}
        className="tag-selector-dropdown"
        style={{
          position: 'fixed',
          top: dropdownPosition.top,
          left: dropdownPosition.left,
          width: '300px',
          background: 'var(--bg-elevated, #1a1a1a)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          zIndex: 9999,
          overflow: 'hidden',
          animation: 'dropdownEnter 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes dropdownEnter {
            from { opacity: 0; transform: scale(0.95) translateY(-4px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          .tag-selector-dropdown::-webkit-scrollbar { width: 6px; }
          .tag-selector-dropdown::-webkit-scrollbar-track { background: transparent; }
          .tag-selector-dropdown::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 3px; }
        `}</style>

        {isCreating ? (
          // Create tag view
          <div style={{ padding: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}>
              <button
                onClick={() => setIsCreating(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  background: 'var(--bg-hover)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <ChevronLeftIcon size={14} />
              </button>
              <span style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                Create label
              </span>
            </div>

            {/* Preview */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              padding: '12px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '3px',
                background: selectedColor,
                boxShadow: `0 0 8px ${selectedColor}50`,
              }} />
              <span style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}>
                {searchQuery.trim() || 'Label name'}
              </span>
            </div>

            {/* Color picker */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Color
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
              }}>
                {TAG_COLOR_PALETTE.map(color => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color.value)}
                    title={color.name}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: color.value,
                      border: selectedColor === color.value
                        ? '2px solid white'
                        : '2px solid transparent',
                      boxShadow: selectedColor === color.value
                        ? `0 0 0 2px ${color.value}`
                        : 'none',
                      cursor: 'pointer',
                      transition: 'all 120ms ease',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Create button */}
            <button
              onClick={handleCreateTag}
              disabled={!searchQuery.trim() || createLoading}
              style={{
                width: '100%',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'white',
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: '8px',
                cursor: searchQuery.trim() && !createLoading ? 'pointer' : 'not-allowed',
                opacity: searchQuery.trim() && !createLoading ? 1 : 0.5,
                transition: 'opacity 150ms ease',
              }}
            >
              {createLoading ? 'Creating...' : 'Create label'}
            </button>
          </div>
        ) : (
          // Tag selection view
          <>
            {/* Search input */}
            <div style={{
              padding: '12px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
              }}>
                <SearchIcon size={15} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search or create label..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      background: 'var(--bg-hover)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                    }}
                  >
                    <XIcon size={10} />
                  </button>
                )}
              </div>
            </div>

            {/* Tag list */}
            <div style={{
              maxHeight: '260px',
              overflowY: 'auto',
              padding: '6px',
            }}>
              {filteredTags.length > 0 ? (
                filteredTags.map((tag, index) => {
                  const isAssigned = assignedTags.some((t) => t.id === tag.id);
                  const isFocused = focusedIndex === index;

                  return (
                    <TagRow
                      key={tag.id}
                      tag={tag}
                      isAssigned={isAssigned}
                      isFocused={isFocused}
                      onClick={() => toggleTag(tag)}
                      onMouseEnter={() => setFocusedIndex(index)}
                    />
                  );
                })
              ) : !showCreateOption ? (
                <EmptyState searchQuery={searchQuery} onCreateClick={() => setIsCreating(true)} />
              ) : null}

              {/* Create option */}
              {showCreateOption && (
                <div
                  onClick={() => setIsCreating(true)}
                  onMouseEnter={() => setFocusedIndex(filteredTags.length)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: focusedIndex === filteredTags.length ? 'var(--bg-hover)' : 'transparent',
                    marginTop: filteredTags.length > 0 ? '4px' : 0,
                    borderTop: filteredTags.length > 0 ? '1px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'var(--accent-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <PlusIcon size={12} />
                  </div>
                  <span style={{
                    fontSize: '13px',
                    color: 'var(--accent-primary)',
                    fontWeight: 500,
                  }}>
                    Create "{searchQuery.trim()}"
                  </span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '8px 12px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <KeyboardHint keys={['↑', '↓']} label="navigate" />
              <KeyboardHint keys={['↵']} label="select" />
              <KeyboardHint keys={['esc']} label="close" />
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
        }}
      >
        {assignedTags.length > 0 ? (
          <>
            {assignedTags.slice(0, 3).map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
            {assignedTags.length > 3 && (
              <span style={{
                fontSize: '11px',
                color: 'var(--text-quaternary)',
                padding: '2px 6px',
                background: 'var(--bg-tertiary)',
                borderRadius: '4px',
              }}>
                +{assignedTags.length - 3}
              </span>
            )}
            <AddButton />
          </>
        ) : (
          <AddTagTrigger />
        )}
      </div>

      {dropdown}
    </>
  );
}

// ============================================
// Tag Row in Dropdown
// ============================================

interface TagRowProps {
  tag: Tag;
  isAssigned: boolean;
  isFocused: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function TagRow({ tag, isAssigned, isFocused, onClick, onMouseEnter }: TagRowProps) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: '8px',
        cursor: 'pointer',
        background: isFocused ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 80ms ease',
        position: 'relative',
      }}
    >
      {isFocused && (
        <div style={{
          position: 'absolute',
          left: '0',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '2px',
          height: '16px',
          background: 'var(--accent-primary)',
          borderRadius: '1px',
        }} />
      )}

      <div style={{
        width: '16px',
        height: '16px',
        borderRadius: '5px',
        border: isAssigned ? 'none' : '1.5px solid var(--border-default)',
        background: isAssigned ? 'var(--accent-primary)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 120ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {isAssigned && <CheckIcon size={10} color="white" />}
      </div>

      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '3px',
        background: tag.color || '#6b7280',
        flexShrink: 0,
        boxShadow: tag.color ? `0 0 6px ${tag.color}40` : 'none',
      }} />

      <span style={{
        flex: 1,
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
      }}>
        {tag.name}
      </span>
    </div>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState({ searchQuery, onCreateClick }: { searchQuery: string; onCreateClick: () => void }) {
  return (
    <div style={{
      padding: '32px 16px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        margin: '0 auto 12px',
        background: 'var(--bg-tertiary)',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <TagIcon size={18} />
      </div>
      <p style={{
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-secondary)',
        margin: '0 0 4px',
      }}>
        {searchQuery ? 'No labels found' : 'No labels yet'}
      </p>
      <p style={{
        fontSize: '12px',
        color: 'var(--text-quaternary)',
        margin: '0 0 16px',
      }}>
        {searchQuery
          ? `No results for "${searchQuery}"`
          : 'Create labels to organize conversations'
        }
      </p>
      {!searchQuery && (
        <button
          onClick={onCreateClick}
          style={{
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--accent-primary)',
            background: 'var(--accent-subtle)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background 150ms ease',
          }}
        >
          Create your first label
        </button>
      )}
    </div>
  );
}

// ============================================
// Keyboard Hint
// ============================================

function KeyboardHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '11px',
      color: 'var(--text-quaternary)',
    }}>
      {keys.map((key, i) => (
        <span
          key={i}
          style={{
            padding: '2px 5px',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 500,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {key}
        </span>
      ))}
      <span>{label}</span>
    </div>
  );
}

// ============================================
// Tag Pill (inline display)
// ============================================

export function TagPill({ tag }: { tag: Tag }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 8px',
      fontSize: '11px',
      fontWeight: 500,
      color: tag.color || 'var(--text-secondary)',
      background: tag.color ? `${tag.color}18` : 'var(--bg-tertiary)',
      borderRadius: '5px',
      whiteSpace: 'nowrap',
      letterSpacing: '-0.01em',
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '2px',
        background: tag.color || 'var(--text-quaternary)',
      }} />
      {tag.name}
    </span>
  );
}

// ============================================
// Trigger Components
// ============================================

function AddTagTrigger() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        fontSize: '11px',
        fontWeight: 500,
        color: isHovered ? 'var(--accent-primary)' : 'var(--text-quaternary)',
        background: 'transparent',
        border: `1px dashed ${isHovered ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        borderRadius: '5px',
        transition: 'all 150ms ease',
      }}
    >
      <PlusIcon size={10} />
      <span>Add label</span>
    </div>
  );
}

function AddButton() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isHovered ? 'var(--text-primary)' : 'var(--text-quaternary)',
        background: isHovered ? 'var(--bg-hover)' : 'transparent',
        borderRadius: '5px',
        transition: 'all 150ms ease',
      }}
    >
      <PlusIcon size={12} />
    </div>
  );
}

// ============================================
// Icons
// ============================================

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-quaternary)', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-quaternary)' }}>
      <path d="M2 4a2 2 0 0 1 2-2h3.172a2 2 0 0 1 1.414.586l5.828 5.828a2 2 0 0 1 0 2.828l-3.172 3.172a2 2 0 0 1-2.828 0L2.586 8.586A2 2 0 0 1 2 7.172V4z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 8l4 4 6-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
