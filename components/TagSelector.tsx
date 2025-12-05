"use client";

import { useState, useEffect, useRef } from "react";
import { Tag as TagIcon, Plus, Check, X } from "lucide-react";

interface Tag {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  _count?: {
    contacts: number;
  };
}

interface ContactTag {
  tag: {
    id: string;
    name: string;
    color: string | null;
  };
}

interface TagSelectorProps {
  contactId: string;
  currentTags: ContactTag[];
  onTagsUpdated: (tags: ContactTag[]) => void;
}

export function TagSelector({
  contactId,
  currentTags,
  onTagsUpdated,
}: TagSelectorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Compute assigned tag IDs fresh from currentTags prop
  const assignedTagIds = new Set(currentTags.map(ct => ct.tag.id));

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Fetch all available tags when dropdown opens
  useEffect(() => {
    if (isOpen && allTags.length === 0) {
      fetchTags();
    }
  }, [isOpen]);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      setAllTags(data.tags || []);
    } catch (error) {
      console.error("Error fetching tags:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = async (tagId: string) => {
    const isAssigned = assignedTagIds.has(tagId);
    setUpdating(tagId);

    try {
      const url = `/api/contacts/${contactId}/tags${isAssigned ? `?tagId=${tagId}` : ""}`;
      const method = isAssigned ? "DELETE" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(isAssigned ? {} : { body: JSON.stringify({ tagId }) }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update tag");
      }

      // Update local state immediately
      const updatedTags = isAssigned
        ? currentTags.filter(ct => ct.tag.id !== tagId)
        : [
            ...currentTags,
            {
              tag: allTags.find(t => t.id === tagId) || {
                id: tagId,
                name: "Unknown",
                color: null,
              },
            },
          ];

      onTagsUpdated(updatedTags);
    } catch (error) {
      console.error("Error toggling tag:", error);
      alert(`Failed to ${isAssigned ? "remove" : "add"} tag: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Tag Display / Add Button - Prominent Gmail-style */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      >
        {currentTags.length > 0 ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            {currentTags.slice(0, 2).map((tagWrapper) => (
              <div
                key={tagWrapper.tag.id}
                className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold shadow-sm"
                style={{
                  backgroundColor: tagWrapper.tag.color || "#6b7280",
                  color: "#ffffff",
                }}
              >
                {tagWrapper.tag.name}
              </div>
            ))}
            {currentTags.length > 2 && (
              <div className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-gray-500 text-white shadow-sm">
                +{currentTags.length - 2}
              </div>
            )}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-gray-500 hover:text-[#0088cc] hover:bg-gray-50 transition-colors border border-dashed border-gray-300">
            <Plus className="h-3 w-3" />
            <span>Add tag</span>
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 max-h-96 overflow-y-auto">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Select Tags</h3>
            {currentTags.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {currentTags.length} tag{currentTags.length !== 1 ? "s" : ""} applied
              </p>
            )}
          </div>

          {loading ? (
            <div className="px-3 py-8 text-center">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-[#0088cc] border-r-transparent"></div>
              <p className="text-sm text-gray-500 mt-2">Loading tags...</p>
            </div>
          ) : allTags.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <TagIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No tags available</p>
            </div>
          ) : (
            <div className="py-1">
              {allTags.map((tag) => {
                const isAssigned = assignedTagIds.has(tag.id);
                const isUpdating = updating === tag.id;

                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    disabled={isUpdating}
                    className={`w-full px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between disabled:opacity-50 ${
                      isAssigned ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {/* Checkbox-style indicator - clear visual feedback */}
                      <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isAssigned
                          ? "bg-[#0088cc] border-[#0088cc]"
                          : "border-gray-300"
                      }`}>
                        {isAssigned && (
                          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                        )}
                      </div>

                      {/* Tag badge */}
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold"
                        style={{
                          backgroundColor: tag.color || "#6b7280",
                          color: "#ffffff",
                        }}
                      >
                        {tag.name}
                      </span>
                    </div>

                    {/* Loading spinner */}
                    {isUpdating && (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-[#0088cc] border-r-transparent"></div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
