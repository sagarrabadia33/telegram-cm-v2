'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SearchResult {
  id: string;
  body: string;
  headline: string;
  sentAt: string;
  direction: string;
  rank: number;
  conversation: {
    id: string;
    title: string | null;
    type: string;
  };
  contact: {
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface SearchResponse {
  success: boolean;
  data: {
    results: SearchResult[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    query: string;
    took: number;
  };
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string, messageId?: string) => void;
}

export default function SearchModal({
  isOpen,
  onClose,
  onSelectConversation,
}: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [took, setTook] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setPage(1);
    }
  }, [isOpen]);

  // Search function with debouncing
  const performSearch = useCallback(async (searchQuery: string, pageNum: number = 1) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setTotal(0);
      setTook(0);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}&page=${pageNum}&pageSize=20`
      );
      const data: SearchResponse = await response.json();

      if (data.success) {
        setResults(data.data.results);
        setTotal(data.data.total);
        setTook(data.data.took);
        setPage(data.data.page);
        setTotalPages(data.data.totalPages);
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query, 1);
    }, 150); // Fast debounce for responsive feel

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        const result = results[selectedIndex];
        onSelectConversation(result.conversation.id, result.id);
        onClose();
      }
    },
    [results, selectedIndex, onSelectConversation, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, results.length]);

  // Handle result click
  const handleResultClick = (result: SearchResult) => {
    onSelectConversation(result.conversation.id, result.id);
    onClose();
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Get contact name
  const getContactName = (result: SearchResult) => {
    if (result.contact) {
      return (
        result.contact.displayName ||
        [result.contact.firstName, result.contact.lastName].filter(Boolean).join(' ') ||
        'Unknown'
      );
    }
    return result.direction === 'outbound' ? 'You' : 'Unknown';
  };

  // Get conversation icon
  const getConversationIcon = (type: string) => {
    switch (type) {
      case 'private':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
      case 'group':
      case 'supergroup':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        );
      default:
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid #333',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px',
            borderBottom: '1px solid #333',
            gap: '12px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#666"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search messages..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '16px',
              color: '#fff',
            }}
          />
          {isLoading && (
            <div
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid #333',
                borderTopColor: '#666',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          )}
          <div
            style={{
              fontSize: '12px',
              color: '#666',
              backgroundColor: '#2a2a2a',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            ESC
          </div>
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: query.length >= 2 ? '8px' : '0',
          }}
        >
          {query.length >= 2 && results.length === 0 && !isLoading && (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#666',
              }}
            >
              No results found for "{query}"
            </div>
          )}

          {results.map((result, index) => (
            <div
              key={result.id}
              onClick={() => handleResultClick(result)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex ? '#2a2a2a' : 'transparent',
                borderRadius: '8px',
                marginBottom: '4px',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {/* Conversation header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '6px',
                }}
              >
                <span style={{ color: '#666' }}>
                  {getConversationIcon(result.conversation.type)}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#999',
                  }}
                >
                  {result.conversation.title || 'Unknown'}
                </span>
                <span style={{ color: '#444' }}>·</span>
                <span
                  style={{
                    fontSize: '12px',
                    color: '#666',
                  }}
                >
                  {getContactName(result)}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    color: '#555',
                    marginLeft: 'auto',
                  }}
                >
                  {formatDate(result.sentAt)}
                </span>
              </div>

              {/* Message content with highlights */}
              <div
                style={{
                  fontSize: '14px',
                  color: '#ccc',
                  lineHeight: '1.5',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
                dangerouslySetInnerHTML={{
                  __html: result.headline
                    .replace(/<mark>/g, '<span style="background-color: #4a4a00; color: #fff; padding: 0 2px; border-radius: 2px;">')
                    .replace(/<\/mark>/g, '</span>'),
                }}
              />
            </div>
          ))}
        </div>

        {/* Footer with stats */}
        {query.length >= 2 && (
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#666',
            }}
          >
            <div>
              {total > 0 ? (
                <>
                  {total.toLocaleString()} results
                  {totalPages > 1 && ` · Page ${page}/${totalPages}`}
                </>
              ) : (
                'No results'
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => page > 1 && performSearch(query, page - 1)}
                    disabled={page <= 1}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: page <= 1 ? '#444' : '#888',
                      cursor: page <= 1 ? 'default' : 'pointer',
                      padding: '4px 8px',
                      fontSize: '12px',
                    }}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => page < totalPages && performSearch(query, page + 1)}
                    disabled={page >= totalPages}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: page >= totalPages ? '#444' : '#888',
                      cursor: page >= totalPages ? 'default' : 'pointer',
                      padding: '4px 8px',
                      fontSize: '12px',
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
              <span>{took}ms</span>
            </div>
          </div>
        )}

        {/* Keyboard hints */}
        {query.length < 2 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#555',
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#444"
                strokeWidth="1.5"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <div style={{ marginBottom: '8px' }}>Search across all messages</div>
            <div style={{ fontSize: '12px', color: '#444' }}>
              Type at least 2 characters to search
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
