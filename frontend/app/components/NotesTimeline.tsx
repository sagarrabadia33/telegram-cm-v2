'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NoteIcon, MeetingIcon, CallIcon, FileNoteIcon, PlusIcon, TrashIcon, EditIcon, DownloadIcon } from './Icons';

// Global notes cache for instant loading - Lightning speed!
// Notes persist across tab switches and panel re-renders
// Export so ContactModal can access it for notes count badge
export const notesCache = new Map<string, {
  notes: NoteEntry[];
  fetchedAt: number;
}>();

// Cache validity: 5 minutes (background refresh happens anyway)
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface NoteEntry {
  id: string;
  type: 'note' | 'meeting' | 'call' | 'file';
  title?: string | null;
  content: string;
  fileName?: string | null;
  fileUrl?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  eventAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NotesTimelineProps {
  conversationId: string;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onNotesCountChange?: (count: number) => void;
  fullHeight?: boolean;
  onNotesChange?: () => void; // Callback when notes are created/updated/deleted
}

// Format relative time - Linear style
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Get file extension
function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() || 'FILE';
}

// Note type icon component
function NoteTypeIcon({ type, className }: { type: NoteEntry['type']; className?: string }) {
  const style = { width: '12px', height: '12px' };
  switch (type) {
    case 'meeting':
      return <MeetingIcon style={style} className={className} />;
    case 'call':
      return <CallIcon style={style} className={className} />;
    case 'file':
      return <FileNoteIcon style={style} className={className} />;
    default:
      return <NoteIcon style={style} className={className} />;
  }
}

// Single note entry - Linear minimal style
function NoteEntryItem({
  note,
  onEdit,
  onDelete,
  isLast,
}: {
  note: NoteEntry;
  onEdit: () => void;
  onDelete: () => void;
  isLast: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  // Use eventAt (when event happened) if available, otherwise fall back to createdAt
  const date = new Date(note.eventAt || note.createdAt);

  // Check if content is just a placeholder
  const isContentPlaceholder = !note.content ||
    note.content.startsWith('Attached file:') ||
    note.content.startsWith('Attached:');

  // Download file handler
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!note.fileUrl) return;
    try {
      const response = await fetch(`/api/upload?key=${encodeURIComponent(note.fileUrl)}`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = note.fileName || 'download';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        paddingLeft: '20px',
        paddingBottom: isLast ? '0' : '16px',
      }}
    >
      {/* Timeline line */}
      {!isLast && (
        <div style={{
          position: 'absolute',
          left: '5px',
          top: '12px',
          bottom: '0',
          width: '1px',
          background: 'var(--border-subtle)',
        }} />
      )}

      {/* Timeline dot */}
      <div style={{
        position: 'absolute',
        left: '0',
        top: '4px',
        width: '11px',
        height: '11px',
        borderRadius: '50%',
        background: 'var(--bg-primary)',
        border: '2px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: note.type === 'file' ? '#6366f1' :
                      note.type === 'meeting' ? '#10b981' :
                      note.type === 'call' ? '#f59e0b' : 'var(--text-quaternary)',
        }} />
      </div>

      {/* Content */}
      <div style={{
        background: isHovered ? 'var(--bg-hover)' : 'transparent',
        borderRadius: '6px',
        padding: '6px 8px',
        marginLeft: '-8px',
        transition: 'background 100ms ease',
      }}>
        {/* Header row - time and actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '4px',
        }}>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-quaternary)',
            fontWeight: '500',
          }}>
            {formatRelativeTime(date)}
          </span>

          {/* Actions - fade in on hover */}
          <div style={{
            display: 'flex',
            gap: '2px',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 100ms ease',
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--text-quaternary)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-quaternary)'}
            >
              <EditIcon style={{ width: '11px', height: '11px' }} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--text-quaternary)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-quaternary)'}
            >
              <TrashIcon style={{ width: '11px', height: '11px' }} />
            </button>
          </div>
        </div>

        {/* Title for meetings/calls */}
        {note.title && (
          <div style={{
            fontSize: '13px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            marginBottom: '2px',
          }}>
            {note.title}
          </div>
        )}

        {/* File attachment - compact inline style */}
        {note.fileUrl && note.fileName && (
          <button
            onClick={handleDownload}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'var(--text-primary)',
              marginBottom: note.content && !isContentPlaceholder ? '6px' : '0',
              transition: 'all 100ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
          >
            <span style={{
              fontSize: '9px',
              fontWeight: '600',
              color: '#dc2626',
              background: '#fee2e2',
              padding: '1px 4px',
              borderRadius: '2px',
            }}>
              {getFileExtension(note.fileName)}
            </span>
            <span style={{
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {note.fileName}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-quaternary)' }}>
              {note.fileSize && formatFileSize(note.fileSize)}
            </span>
            <DownloadIcon style={{ width: '10px', height: '10px', color: 'var(--text-quaternary)' }} />
          </button>
        )}

        {/* Content text */}
        {note.content && !isContentPlaceholder && (
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: '1.4',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {note.content}
          </p>
        )}
      </div>
    </div>
  );
}

// Trigger AI re-analysis for a conversation (force=true because notes changed, not messages)
async function triggerAIReanalysis(conversationId: string) {
  try {
    await fetch('/api/ai/auto-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationIds: [conversationId],
        forceReanalyze: true, // Force re-analysis even if no new messages
      }),
    });
  } catch (error) {
    console.error('Failed to trigger AI re-analysis:', error);
  }
}

// Main NotesTimeline component
export default function NotesTimeline({
  conversationId,
  isExpanded = false,
  onToggleExpanded,
  onNotesCountChange,
  fullHeight = false,
  onNotesChange,
}: NotesTimelineProps) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Instant cache load on mount - Lightning speed!
  useEffect(() => {
    if (!conversationId) return;
    const cached = notesCache.get(conversationId);
    if (cached) {
      setNotes(cached.notes);
      onNotesCountChange?.(cached.notes.length);
    }
  }, [conversationId, onNotesCountChange]);

  // Fetch notes with caching strategy: show cache instantly, refresh in background
  const fetchNotes = useCallback(async (skipCacheCheck = false) => {
    if (!conversationId) return;

    const cached = notesCache.get(conversationId);
    const now = Date.now();

    // If we have fresh cache and not forced, skip network
    if (!skipCacheCheck && cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
      if (notes.length === 0) {
        setNotes(cached.notes);
        onNotesCountChange?.(cached.notes.length);
      }
      return;
    }

    // Only show loading if we have no cached data
    if (!cached) {
      setLoading(true);
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`);
      const data = await response.json();
      if (data.success) {
        const fetchedNotes = data.data.notes || [];
        // Update cache
        notesCache.set(conversationId, {
          notes: fetchedNotes,
          fetchedAt: Date.now(),
        });
        setNotes(fetchedNotes);
        onNotesCountChange?.(fetchedNotes.length);
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, onNotesCountChange, notes.length]);

  // Initial fetch - background refresh
  useEffect(() => {
    fetchNotes();
  }, [conversationId]); // Only re-fetch on conversationId change

  // Create note - optimistic UI + cache update
  const createNote = async (noteData: Partial<NoteEntry>) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteData),
      });
      const data = await response.json();
      if (data.success) {
        const newNotes = [data.data, ...notes];
        setNotes(newNotes);
        onNotesCountChange?.(newNotes.length);
        // Update cache immediately
        notesCache.set(conversationId, {
          notes: newNotes,
          fetchedAt: Date.now(),
        });
        setShowAddModal(false);
        // Trigger AI re-analysis when notes change
        triggerAIReanalysis(conversationId);
        onNotesChange?.();
      }
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  // Update note - with cache update
  const updateNote = async (noteId: string, noteData: Partial<NoteEntry>) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: noteId, ...noteData }),
      });
      const data = await response.json();
      if (data.success) {
        const newNotes = notes.map(n => n.id === noteId ? data.data : n);
        setNotes(newNotes);
        // Update cache immediately
        notesCache.set(conversationId, {
          notes: newNotes,
          fetchedAt: Date.now(),
        });
        setEditingNote(null);
        // Trigger AI re-analysis when notes change
        triggerAIReanalysis(conversationId);
        onNotesChange?.();
      }
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  };

  // Delete note - with cache update
  const deleteNote = async (noteId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      const data = await response.json();
      if (data.success) {
        const newNotes = notes.filter(n => n.id !== noteId);
        setNotes(newNotes);
        onNotesCountChange?.(newNotes.length);
        // Update cache immediately
        notesCache.set(conversationId, {
          notes: newNotes,
          fetchedAt: Date.now(),
        });
        setDeleteConfirm(null);
        // Trigger AI re-analysis when notes change
        triggerAIReanalysis(conversationId);
        onNotesChange?.();
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  // Full height mode (used in tabs) - no collapsible header
  if (fullHeight) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Simple header with add button */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <span style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
          }}>
            {notes.length === 0 ? 'No notes' : `${notes.length} note${notes.length !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              fontSize: '12px',
              fontWeight: '500',
              color: 'var(--accent-primary)',
              background: 'var(--accent-subtle)',
              border: '1px solid var(--accent-primary)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 100ms ease',
            }}
          >
            <PlusIcon style={{ width: '12px', height: '12px' }} />
            Add note
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
        }}>
          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px',
            }}>
              <LoadingSpinner size={14} />
            </div>
          ) : notes.length === 0 ? (
            <FullHeightEmptyState onAddNote={() => setShowAddModal(true)} />
          ) : (
            <div>
              {notes.map((note, index) => (
                <NoteEntryItem
                  key={note.id}
                  note={note}
                  onEdit={() => setEditingNote(note)}
                  onDelete={() => setDeleteConfirm(note.id)}
                  isLast={index === notes.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Modal */}
        {(showAddModal || editingNote) && (
          <NoteModal
            isOpen={true}
            onClose={() => {
              setShowAddModal(false);
              setEditingNote(null);
            }}
            onSave={async (noteData) => {
              if (editingNote) {
                await updateNote(editingNote.id, noteData);
              } else {
                await createNote(noteData);
              }
            }}
            editingNote={editingNote}
          />
        )}

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <DeleteConfirmModal
            onConfirm={() => deleteNote(deleteConfirm)}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
      </div>
    );
  }

  // Collapsible mode (original behavior)
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Header - Linear style minimal */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpanded?.();
          }
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 100ms ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NoteIcon style={{ width: '14px', height: '14px', color: 'var(--text-tertiary)' }} />
          <span style={{
            fontSize: '13px',
            fontWeight: '500',
            color: 'var(--text-secondary)',
          }}>
            Notes
          </span>
          {notes.length > 0 && (
            <span style={{
              fontSize: '11px',
              color: 'var(--text-quaternary)',
            }}>
              {notes.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAddModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              transition: 'all 100ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.color = 'var(--accent-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
            title="Add note"
          >
            <PlusIcon style={{ width: '12px', height: '12px' }} />
          </button>
          <ChevronIcon style={{
            width: '12px',
            height: '12px',
            color: 'var(--text-quaternary)',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
          }} />
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div style={{
          padding: '4px 16px 16px',
          maxHeight: '280px',
          overflowY: 'auto',
        }}>
          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}>
              <LoadingSpinner size={14} />
            </div>
          ) : notes.length === 0 ? (
            <EmptyState onAddNote={() => setShowAddModal(true)} />
          ) : (
            <div style={{ paddingTop: '4px' }}>
              {notes.map((note, index) => (
                <NoteEntryItem
                  key={note.id}
                  note={note}
                  onEdit={() => setEditingNote(note)}
                  onDelete={() => setDeleteConfirm(note.id)}
                  isLast={index === notes.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingNote) && (
        <NoteModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingNote(null);
          }}
          onSave={async (noteData) => {
            if (editingNote) {
              await updateNote(editingNote.id, noteData);
            } else {
              await createNote(noteData);
            }
          }}
          editingNote={editingNote}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <DeleteConfirmModal
          onConfirm={() => deleteNote(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// Empty state - Linear style (for collapsible mode)
function EmptyState({ onAddNote }: { onAddNote: () => void }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '24px 16px',
    }}>
      <p style={{
        margin: '0 0 8px',
        fontSize: '12px',
        color: 'var(--text-quaternary)',
      }}>
        No notes yet
      </p>
      <button
        onClick={onAddNote}
        style={{
          fontSize: '12px',
          color: 'var(--accent-primary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'background 100ms ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-subtle)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        Add a note
      </button>
    </div>
  );
}

// Full height empty state - Linear style (for tabs mode)
function FullHeightEmptyState({ onAddNote }: { onAddNote: () => void }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '48px 24px',
      height: '100%',
      minHeight: '200px',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '16px',
      }}>
        <NoteIcon style={{ width: '24px', height: '24px', color: 'var(--text-tertiary)' }} />
      </div>
      <h3 style={{
        margin: '0 0 8px',
        fontSize: '14px',
        fontWeight: '600',
        color: 'var(--text-secondary)',
      }}>
        No notes yet
      </h3>
      <p style={{
        margin: '0 0 16px',
        fontSize: '13px',
        color: 'var(--text-tertiary)',
        maxWidth: '240px',
        lineHeight: '1.4',
      }}>
        Add notes to track context, meeting summaries, and important details about this conversation.
      </p>
      <button
        onClick={onAddNote}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          fontSize: '13px',
          fontWeight: '500',
          color: 'var(--accent-primary)',
          background: 'var(--accent-subtle)',
          border: '1px solid var(--accent-primary)',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 100ms ease',
        }}
      >
        <PlusIcon style={{ width: '14px', height: '14px' }} />
        Add your first note
      </button>
    </div>
  );
}

// Helper to format date for datetime-local input
function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

// Helper to format display date for the button
function formatDisplayDate(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${dateStr} at ${timeStr}`;
  }
}

// Note Modal - Linear style (minimal, adaptive, world-class UX)
function NoteModal({
  isOpen,
  onClose,
  onSave,
  editingNote,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Partial<NoteEntry>) => Promise<void>;
  editingNote?: NoteEntry | null;
}) {
  // Only 3 types: note (default), meeting, call
  // File is an attachment option, not a type
  const [type, setType] = useState<'note' | 'meeting' | 'call'>(
    editingNote?.type === 'file' ? 'note' : (editingNote?.type as 'note' | 'meeting' | 'call') || 'note'
  );
  const [title, setTitle] = useState(editingNote?.title || '');
  const [content, setContent] = useState(editingNote?.content || '');
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Event date - when did this happen? Defaults to now, allows backdating
  const [eventAt, setEventAt] = useState<Date>(() => {
    if (editingNote?.eventAt) return new Date(editingNote.eventAt);
    return new Date();
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Focus appropriate field on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (type === 'meeting' || type === 'call') {
          titleRef.current?.focus();
        } else {
          textareaRef.current?.focus();
        }
      }, 50);
    }
  }, [isOpen, type]);

  // Close date picker when clicking outside
  useEffect(() => {
    if (!showDatePicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSave = async () => {
    // For meetings/calls, title is required
    if ((type === 'meeting' || type === 'call') && !title.trim()) return;
    // For notes, content or file is required
    if (type === 'note' && !content.trim() && !selectedFile && !editingNote?.fileUrl) return;

    setSaving(true);
    try {
      let fileData: { fileName?: string; fileUrl?: string; fileMimeType?: string; fileSize?: number } = {};

      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadResult = await uploadResponse.json();
        if (uploadResult.success) {
          fileData = {
            fileName: uploadResult.file.filename,
            fileUrl: uploadResult.file.storageKey,
            fileMimeType: uploadResult.file.mimeType,
            fileSize: uploadResult.file.size,
          };
        }
      }

      await onSave({
        type: selectedFile && !content.trim() && type === 'note' ? 'file' : type,
        title: title.trim() || undefined,
        content: content.trim() || (selectedFile ? `Attached: ${selectedFile.name}` : ''),
        eventAt: eventAt.toISOString(),
        ...fileData,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const needsTitle = type === 'meeting' || type === 'call';
  const canSave = needsTitle
    ? title.trim().length > 0
    : (content.trim().length > 0 || selectedFile || editingNote?.fileUrl);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '400px',
          maxWidth: '90vw',
          background: 'var(--bg-primary)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Minimal header - just close button */}
        <div style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Type selector - minimal segmented control */}
          <div style={{
            display: 'flex',
            gap: '2px',
            background: 'var(--bg-secondary)',
            padding: '3px',
            borderRadius: '8px',
          }}>
            {[
              { value: 'note', label: 'Note' },
              { value: 'meeting', label: 'Meeting' },
              { value: 'call', label: 'Call' },
            ].map((t) => {
              const isSelected = type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value as typeof type)}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: isSelected ? '600' : '500',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    background: isSelected ? 'var(--bg-primary)' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 100ms ease',
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              color: 'var(--text-tertiary)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        {/* Content - adaptive based on type */}
        <div style={{ padding: '0 16px 16px' }}>
          {/* Title field - only for meeting/call */}
          {needsTitle && (
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'meeting' ? 'Meeting with...' : 'Call with...'}
              style={{
                width: '100%',
                padding: '0',
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                marginBottom: '8px',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  textareaRef.current?.focus();
                }
              }}
            />
          )}

          {/* Content textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={needsTitle ? 'Add details...' : 'Write something...'}
            style={{
              width: '100%',
              minHeight: needsTitle ? '60px' : '100px',
              padding: '0',
              fontSize: '14px',
              color: 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: '1.6',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                e.preventDefault();
                handleSave();
              }
              if (e.key === 'Escape') {
                onClose();
              }
            }}
          />

          {/* File attachment area */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* Existing file (editing) */}
          {editingNote?.fileUrl && editingNote?.fileName && !selectedFile && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              marginTop: '12px',
            }}>
              <FileNoteIcon style={{ width: '14px', height: '14px', color: 'var(--text-tertiary)' }} />
              <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)' }}>
                {editingNote.fileName}
              </span>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const response = await fetch(`/api/upload?key=${encodeURIComponent(editingNote.fileUrl!)}`);
                    if (!response.ok) throw new Error('Download failed');
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = editingNote.fileName || 'download';
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                  } catch (error) {
                    console.error('Download failed:', error);
                  }
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: '4px',
                }}
              >
                <DownloadIcon style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          )}

          {/* New file selected */}
          {selectedFile && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              background: 'var(--accent-subtle)',
              borderRadius: '8px',
              marginTop: '12px',
            }}>
              <FileNoteIcon style={{ width: '14px', height: '14px', color: 'var(--accent-primary)' }} />
              <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)' }}>
                {selectedFile.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>
                {formatFileSize(selectedFile.size)}
              </span>
              <button
                onClick={() => setSelectedFile(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: '4px',
                }}
              >
                <CloseIcon style={{ width: '12px', height: '12px' }} />
              </button>
            </div>
          )}
        </div>

        {/* Footer - clean action bar */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {/* Left: Attach + Date picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                color: 'var(--text-tertiary)',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 100ms ease',
              }}
              title="Attach file"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }}
            >
              <AttachIcon style={{ width: '16px', height: '16px' }} />
            </button>

            {/* Date picker - click to toggle */}
            <div ref={datePickerRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: showDatePicker ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  background: showDatePicker ? 'var(--bg-secondary)' : 'transparent',
                  border: '1px solid',
                  borderColor: showDatePicker ? 'var(--border-default)' : 'var(--border-subtle)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 100ms ease',
                }}
                title="When did this happen?"
                onMouseEnter={(e) => {
                  if (!showDatePicker) {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showDatePicker) {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.color = 'var(--text-tertiary)';
                  }
                }}
              >
                <CalendarIcon style={{ width: '14px', height: '14px' }} />
                <span>{formatDisplayDate(eventAt)}</span>
              </button>

              {/* Date picker dropdown */}
              {showDatePicker && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    marginBottom: '4px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 10,
                  }}
                >
                  <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '500' }}>
                    When did this happen?
                  </div>
                  <input
                    ref={dateInputRef}
                    type="datetime-local"
                    value={formatDateForInput(eventAt)}
                    max={formatDateForInput(new Date())}
                    onChange={(e) => {
                      if (e.target.value) {
                        setEventAt(new Date(e.target.value));
                      }
                    }}
                    autoFocus
                    style={{
                      padding: '8px 10px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setShowDatePicker(false)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: '500',
                        color: 'var(--accent-primary)',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Cancel + Save */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: '500',
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 100ms ease',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '600',
                color: canSave && !saving ? 'white' : 'var(--text-quaternary)',
                background: canSave && !saving ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                border: 'none',
                borderRadius: '8px',
                cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                transition: 'all 100ms ease',
              }}
            >
              {saving ? 'Saving...' : (editingNote ? 'Update' : 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Delete confirmation modal
function DeleteConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '280px',
          background: 'var(--bg-primary)',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 16px 32px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
          Delete note?
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          This cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              color: 'white',
              background: '#ef4444',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// Loading spinner
function LoadingSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle cx="8" cy="8" r="6" stroke="var(--border-default)" strokeWidth="2" />
      <path d="M14 8a6 6 0 00-6-6" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Chevron icon
function ChevronIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 12 12" fill="none">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Close icon
function CloseIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

// Attach icon (paperclip)
function AttachIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 5.5l-6 6a2.5 2.5 0 01-3.54-3.54l6-6a1.5 1.5 0 112.12 2.12l-6 6a.5.5 0 01-.7-.7l5.5-5.5" />
    </svg>
  );
}

// Calendar icon
function CalendarIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M5 1v3M11 1v3M2 7h12" />
    </svg>
  );
}
